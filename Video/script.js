// ----- Configuration: replace with your own files in ./media/ -----
const PLAYLIST = [
  {
    title: "Sample: Nature",
    src: "media/nature.mp4",
    poster: "",
    subtitles: "media/nature.vtt", // optional; set to "" if none
    lang: "en",
  },
  {
    title: "Sample: City",
    src: "media/city.mp4",
    poster: "",
    subtitles: "",
    lang: "en",
  },
  {
    title: "Sample: Ocean",
    src: "media/ocean.mp4",
    poster: "",
    subtitles: "media/ocean.vtt",
    lang: "en",
  },
];

// ----- Elements -----
const container = document.getElementById("playerContainer");
const video = document.getElementById("video");
const playPauseBtn = document.getElementById("playPause");
const backBtn = document.getElementById("back");
const fwdBtn = document.getElementById("forward");
const muteBtn = document.getElementById("mute");
const volumeSlider = document.getElementById("volume");
const progress = document.getElementById("progress");
const speed = document.getElementById("speed");
const ccBtn = document.getElementById("cc");
const fsBtn = document.getElementById("fullscreen");
const curTime = document.getElementById("currentTime");
const durTime = document.getElementById("duration");
const playlistEl = document.getElementById("playlist");

// ----- State -----
let currentIndex = 0;
let trackEl = null;

// ----- Helpers -----
function fmt(t) {
  if (!Number.isFinite(t)) return "00:00";
  const s = Math.floor(t % 60).toString().padStart(2, "0");
  const m = Math.floor((t / 60) % 60).toString().padStart(2, "0");
  const h = Math.floor(t / 3600);
  return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
}

function setActive(idx) {
  [...playlistEl.children].forEach((li, i) => {
    li.classList.toggle("active", i === idx);
    li.setAttribute("aria-selected", i === idx ? "true" : "false");
  });
}

function attachTrack(src, lang = "en") {
  if (trackEl) trackEl.remove();
  if (!src) return;
  trackEl = document.createElement("track");
  trackEl.kind = "subtitles";
  trackEl.label = "Subtitles";
  trackEl.srclang = lang;
  trackEl.src = src;
  trackEl.default = false;
  video.appendChild(trackEl);
}

function toggleCaptions() {
  const tracks = video.textTracks;
  if (!tracks || tracks.length === 0) return;
  const track = tracks[0];
  const showing = track.mode === "showing";
  track.mode = showing ? "disabled" : "showing";
  ccBtn.textContent = showing ? "CC" : "CC✓";
  ccBtn.setAttribute("aria-pressed", (!showing).toString());
}

function loadVideo(idx, autoplay = true) {
  currentIndex = idx;
  const item = PLAYLIST[idx];
  video.src = item.src;
  if (item.poster) video.poster = item.poster;
  attachTrack(item.subtitles, item.lang);
  setActive(idx);
  // Reset UI
  progress.value = 0;
  curTime.textContent = "00:00";
  durTime.textContent = "00:00";
  playPauseBtn.textContent = "▶️";
  if (autoplay) video.play().catch(() => {}); // ignore autoplay policies
}

// ----- Init playlist -----
function renderPlaylist() {
  playlistEl.innerHTML = "";
  PLAYLIST.forEach((item, idx) => {
    const li = document.createElement("li");
    li.role = "option";
    li.tabIndex = 0;
    li.innerHTML = `
      <div class="meta">
        <span class="title">${item.title}</span>
        <span class="sub">${item.subtitles ? "Captions available" : "No captions"}</span>
      </div>
    `;
    li.addEventListener("click", () => loadVideo(idx, true));
    li.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        loadVideo(idx, true);
      }
    });
    playlistEl.appendChild(li);
  });
}

// ----- Events: controls -----
playPauseBtn.addEventListener("click", () => {
  if (video.paused) {
    video.play();
  } else {
    video.pause();
  }
});

video.addEventListener("play", () => (playPauseBtn.textContent = "⏸️"));
video.addEventListener("pause", () => (playPauseBtn.textContent = "▶️"));

backBtn.addEventListener("click", () => {
  video.currentTime = Math.max(0, video.currentTime - 10);
});

fwdBtn.addEventListener("click", () => {
  video.currentTime = Math.min(video.duration || Infinity, video.currentTime + 10);
});

muteBtn.addEventListener("click", () => {
  video.muted = !video.muted;
});
video.addEventListener("volumechange", () => {
  muteBtn.textContent = video.muted || video.volume === 0 ? "🔇" : "🔈";
  volumeSlider.value = String(video.muted ? 0 : video.volume);
});

volumeSlider.addEventListener("input", () => {
  video.volume = Number(volumeSlider.value);
  video.muted = video.volume === 0;
});

speed.addEventListener("change", () => {
  video.playbackRate = Number(speed.value);
});

fsBtn.addEventListener("click", async () => {
  if (!document.fullscreenElement) {
    await container.requestFullscreen().catch(() => {});
  } else {
    await document.exitFullscreen().catch(() => {});
  }
});

ccBtn.addEventListener("click", toggleCaptions);

// ----- Events: time & progress -----
video.addEventListener("loadedmetadata", () => {
  durTime.textContent = fmt(video.duration);
  progress.max = video.duration || 0;
});

video.addEventListener("timeupdate", () => {
  curTime.textContent = fmt(video.currentTime);
  if (!isNaN(video.duration)) {
    progress.value = video.currentTime;
  }
});

progress.addEventListener("input", () => {
  video.currentTime = Number(progress.value);
});

// Auto-advance
video.addEventListener("ended", () => {
  const next = currentIndex + 1;
  if (next < PLAYLIST.length) {
    loadVideo(next, true);
  } else {
    video.currentTime = 0;
    video.pause();
  }
});

// ----- Keyboard shortcuts -----
document.addEventListener("keydown", (e) => {
  const tag = document.activeElement?.tagName;
  const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
  if (typing) return;

  switch (e.key.toLowerCase()) {
    case " ":
    case "k": // YouTube-style
      e.preventDefault();
      video.paused ? video.play() : video.pause();
      break;
    case "arrowleft":
      e.preventDefault();
      video.currentTime = Math.max(0, video.currentTime - 5);
      break;
    case "arrowright":
      e.preventDefault();
      video.currentTime = Math.min(video.duration || Infinity, video.currentTime + 5);
      break;
    case "arrowup":
      e.preventDefault();
      video.volume = Math.min(1, video.volume + 0.05);
      video.muted = false;
      break;
    case "arrowdown":
      e.preventDefault();
      video.volume = Math.max(0, video.volume - 0.05);
      video.muted = video.volume === 0;
      break;
    case "f":
      e.preventDefault();
      if (!document.fullscreenElement) container.requestFullscreen().catch(() => {});
      else document.exitFullscreen().catch(() => {});
      break;
    case "m":
      e.preventDefault();
      video.muted = !video.muted;
      break;
    case "c":
      e.preventDefault();
      toggleCaptions();
      break;
    case "home":
      e.preventDefault();
      video.currentTime = 0;
      break;
    case "end":
      e.preventDefault();
      video.currentTime = Math.max(0, (video.duration || 0) - 1);
      break;
    default:
      // 0–9 jump to 0–90%
      if (e.key >= "0" && e.key <= "9" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const pct = Number(e.key) / 10;
        if (isFinite(video.duration)) video.currentTime = video.duration * pct;
      }
  }
});

// ----- Boot -----
renderPlaylist();
loadVideo(0, false);
video.volume = 1;
