// =========================
// Configuration Constants
// =========================
const AI_POINT_WEIGHTS = { ace: 4, king: 3, queen: 2, jack: 1 };
const AI_DECISION_DELAY = 800;           // ms before AI plays
const AI_ADVANCED_HEURISTIC = true;      // toggle complexity

// =========================
// LocalStorage Helpers
// =========================
const STORAGE_KEY = 'callBreakState';
function loadState() {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
}
function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// =========================
// Domain Models
// =========================
class Card {
  constructor(suit, rank) {
    this.suit = suit; // '♠','♥','♦','♣'
    this.rank = rank; // '2'–'10','J','Q','K','A'
  }
  get value() {
    const order = { '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'J':11,'Q':12,'K':13,'A':14 };
    return order[this.rank];
  }
  toString() {
    return `${this.rank}${this.suit}`;
  }
}

class Deck {
  constructor() {
    this.cards = [];
    ['♠','♥','♦','♣'].forEach(suit =>
      ['2','3','4','5','6','7','8','9','10','J','Q','K','A']
        .forEach(rank => this.cards.push(new Card(suit, rank)))
    );
  }
  shuffle() {
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
  }
  deal(players) {
    this.shuffle();
    players.forEach(p => p.hand = []);
    for (let i = 0; i < 13; i++) {
      players.forEach(p => p.hand.push(this.cards.pop()));
    }
  }
}

class Player {
  constructor(id, isHuman = false) {
    this.id = id;
    this.isHuman = isHuman;
    this.hand = [];
    this.bid = 0;
    this.tricks = 0;
    this.score = 0;
  }

  // AI bidding heuristic: high‐card points + length bonus
  computeBid() {
    const hcp = this.hand.reduce((sum, c) => {
      if (c.rank === 'A') return sum + AI_POINT_WEIGHTS.ace;
      if (c.rank === 'K') return sum + AI_POINT_WEIGHTS.king;
      if (c.rank === 'Q') return sum + AI_POINT_WEIGHTS.queen;
      if (c.rank === 'J') return sum + AI_POINT_WEIGHTS.jack;
      return sum;
    }, 0);

    if (!AI_ADVANCED_HEURISTIC) {
      this.bid = Math.min(13, Math.floor(hcp / 2));
    } else {
      const suitCounts = this.hand.reduce((m, c) => {
        m[c.suit] = (m[c.suit] || 0) + 1;
        return m;
      }, {});
      const lengthBonus = Object.values(suitCounts)
        .reduce((b, cnt) => b + Math.max(0, cnt - 4), 0);
      this.bid = Math.min(13, Math.floor(hcp / 2) + lengthBonus);
    }
  }

  // AI plays: follows suit if possible, else any; 
  // plays high if needs tricks, low otherwise
  playCard(leadSuit, trumpSuit) {
    let hand = this.hand;
    let candidates = hand.filter(c => c.suit === leadSuit);
    if (!candidates.length) {
      candidates = hand.filter(c => c.suit === trumpSuit) || hand;
    }
    if (this.tricks < this.bid) {
      candidates.sort((a,b) => b.value - a.value);
    } else {
      candidates.sort((a,b) => a.value - b.value);
    }
    const chosen = candidates[0];
    this.hand = hand.filter(c => c !== chosen);
    return chosen;
  }
}

// =========================
// Game Controller
// =========================
class Game {
  constructor() {
    this.players = [
      new Player(0,true),
      new Player(1), new Player(2), new Player(3)
    ];
    this.dealerIndex = 0;
    this.round = 0;
    this.trumpSuit = '♠';
    this.leadingSuit = null;
    this.playOrder = [];
    this.table = [];
    this.state = loadState();
    this.restoreHistory();
    this.cacheElements();
    this.bindUI();
    this.registerServiceWorker();
    this.startRound();
  }

  restoreHistory() {
    if (this.state.scores) {
      this.players.forEach((p,i) => p.score = this.state.scores[i] || 0);
      this.dealerIndex = this.state.dealerIndex || 0;
      this.round = this.state.round || 0;
    }
  }
  persistHistory() {
    this.state.scores = this.players.map(p => p.score);
    this.state.dealerIndex = this.dealerIndex;
    this.state.round = this.round;
    saveState(this.state);
  }

  cacheElements() {
    this.trumpEl       = document.getElementById('trumpSlot');
    this.bidInput      = document.getElementById('bidInput');
    this.submitBidBtn  = document.getElementById('submitBid');
    this.nextRoundBtn  = document.getElementById('nextRound');
    this.resetBtn      = document.getElementById('resetHistory');
    this.centerEl      = document.getElementById('center');
    this.scoreboardEl  = document.getElementById('scoreboard');
    this.roundInfoEl   = document.getElementById('roundInfo');
    this.playerHandEl  = document.getElementById('playerHand');
  }

  bindUI() {
    this.submitBidBtn.addEventListener('click', () => this.onHumanBid());
    this.nextRoundBtn.addEventListener('click', () => this.startRound());
    this.resetBtn.addEventListener('click', () => this.resetGame());
    window.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !this.submitBidBtn.disabled) {
        this.onHumanBid();
      }
    });
  }

  registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      const swCode = `
        const CACHE='cb-v1', ASSETS=['.','index.html','styles.css','script.js'];
        self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))));
        self.addEventListener('fetch',e=>e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request))));
      `;
      const blob = new Blob([swCode],{type:'text/javascript'});
      navigator.serviceWorker.register(URL.createObjectURL(blob)).catch(console.error);
    }
  }

  startRound() {
    this.round++;
    this.leadingSuit = null;
    this.playOrder = [];
    this.table = [];
    this.players.forEach(p => p.tricks = 0);
    const deck = new Deck();
    deck.deal(this.players);
    this.dealerIndex = (this.dealerIndex + 1) % 4;
    this.trumpSuit = ['♠','♥','♦','♣'][Math.floor(Math.random()*4)];
    this.trumpEl.textContent = this.trumpSuit; // update UI
    this.submitBidBtn.disabled = false;
    this.nextRoundBtn.disabled = true;
    this.renderHands();
    this.renderInfo();
    // AI bids
    this.players.slice(1).forEach(ai => ai.computeBid());
    this.renderBids();
  }

  onHumanBid() {
    const v = parseInt(this.bidInput.value,10);
    if (isNaN(v)||v<0||v>13) return;
    this.players[0].bid = v;
    this.renderBids();
    this.submitBidBtn.disabled = true;
    this.determineTurnOrder();
    this.playTrick();
  }

  determineTurnOrder() {
    this.playOrder = [];
    for (let i=1;i<=4;i++) {
      this.playOrder.push((this.dealerIndex + i) % 4);
    }
  }

  playTrick() {
    if (!this.players[0].hand.length) {
      this.finishRound();
      return;
    }
    this.centerEl.innerHTML = '';
    this.table = [];
    this.leadingSuit = null;
    this.nextToPlay(0);
  }

  nextToPlay(idx) {
    if (idx >= 4) {
      return this.resolveTrick();
    }
    const pid = this.playOrder[idx];
    const p = this.players[pid];
    if (p.isHuman) {
      this.highlightLegal();
    } else {
      setTimeout(() => {
        const card = p.playCard(this.leadingSuit, this.trumpSuit);
        this.placeCard(pid, card);
        this.nextToPlay(idx+1);
      }, AI_DECISION_DELAY);
    }
  }

  onCardClick(evt) {
    const card = evt.currentTarget.cardRef;
    if (!this.isLegal(card)) return;
    this.clearHighlights();
    this.players[0].hand = this.players[0].hand.filter(c=>c!==card);
    this.placeCard(0, card);
    const nextIdx = this.table.length;
    this.nextToPlay(nextIdx);
  }

  placeCard(pid, card) {
    if (!this.leadingSuit) this.leadingSuit = card.suit;
    this.table.push({pid,card});
    this.animateToCenter(pid, card);
  }

  animateToCenter(pid, card) {
    const el = document.createElement('div');
    el.className = 'card';
    el.textContent = card.toString();
    this.centerEl.appendChild(el);
    // when all four are in play, wait for animations to settle
  }

  resolveTrick() {
    // find winner: check leading suit and trump
    let winning = this.table[0];
    this.table.forEach(t => {
      const isTrump       = t.card.suit === this.trumpSuit;
      const winIsTrump    = winning.card.suit === this.trumpSuit;
      if ((isTrump && !winIsTrump) ||
          (t.card.suit === this.leadingSuit && winning.card.suit !== this.leadingSuit && !isTrump) ||
          (t.card.suit === winning.card.suit && t.card.value > winning.card.value)) {
        winning = t;
      }
    });
    const winner = this.players[winning.pid];
    winner.tricks++;
    this.animateTrickWin(winning).then(()=>{
      this.clearCenter();
      this.renderTricks();
      this.playTrick();
    });
  }

  animateTrickWin({pid,card}) {
    return new Promise(res => {
      const slot = Array.from(this.centerEl.children)
        .find(el => el.textContent === card.toString());
      const targetArea = document.querySelector(
        pid===0?'#player .pile':`#ai${pid} .pile`
      );
      const from = slot.getBoundingClientRect();
      const to   = targetArea.getBoundingClientRect();
      const clone = slot.cloneNode(true);
      clone.style.position = 'absolute';
      clone.style.top  = from.top + 'px';
      clone.style.left = from.left + 'px';
      document.body.appendChild(clone);
      slot.remove();
      document.querySelector(pid===0?'#player':'#ai'+pid)
        .classList.add('winner');
      clone.animate([
        { transform: 'translate(0,0)' },
        { transform: `translate(${to.left-from.left}px,${to.top-from.top}px)` }
      ], { duration: 500, easing: 'ease-in-out' }).onfinish = () => {
        clone.remove();
        const pileCard = document.createElement('div');
        pileCard.className = 'card small';
        pileCard.textContent = card.toString();
        targetArea.appendChild(pileCard);
        document.querySelector(pid===0?'#player':'#ai'+pid)
          .classList.remove('winner');
        res();
      };
    });
  }

  finishRound() {
    this.players.forEach(p=>{
      const delta = p.tricks >= p.bid
        ? p.bid*10 + (p.tricks-p.bid)
        : -p.bid*10;
      p.score += delta;
    });
    this.persistHistory();
    this.nextRoundBtn.disabled = false;
    this.renderInfo();
  }

  resetGame() {
    localStorage.removeItem(STORAGE_KEY);
    location.reload();
  }

  /* ===== UI Rendering ===== */
  renderHands() {
    this.playerHandEl.innerHTML = '';
    this.players[0].hand.forEach(c=>{
      const el = document.createElement('div');
      el.className = 'card draggable';
      el.tabIndex = 0;
      el.textContent = c.toString();
      el.cardRef = c;
      el.addEventListener('click', e=>this.onCardClick(e));
      el.addEventListener('keydown', e=>{
        if (e.key==='Enter' && this.isLegal(c)) this.onCardClick({currentTarget:el});
      });
      this.playerHandEl.appendChild(el);
    });
  }

  renderBids() {
    this.players.forEach((p,i)=>{
      const sel = i===0?'#player':`#ai${i}`;
      document.querySelector(`${sel} .bid`).textContent = `Bid: ${p.bid}`;
    });
  }

  renderTricks() {
    this.players.forEach((p,i)=>{
      const sel = i===0?'#player':`#ai${i}`;
      document.querySelector(`${sel} .tricks`).textContent = `Tricks: ${p.tricks}`;
    });
  }

  renderInfo() {
    this.renderBids();
    this.renderTricks();
    this.players.forEach((p,i)=>{
      const sel = i===0?'#player':`#ai${i}`;
      document.querySelector(`${sel} .score`).textContent = `Score: ${p.score}`;
    });
    this.scoreboardEl.innerHTML = `
      Round ${this.round} • Dealer: Player ${this.dealerIndex}
    `;
  }

  isLegal(card) {
    if (!this.leadingSuit) return true;
    const hasLead = this.players[0].hand.some(c=>c.suit===this.leadingSuit);
    return !hasLead || card.suit===this.leadingSuit;
  }

  highlightLegal() {
    this.clearHighlights();
    this.playerHandEl.querySelectorAll('.card').forEach(el=>{
      if (this.isLegal(el.cardRef)) el.classList.add('highlight');
    });
  }
  clearHighlights() {
    this.playerHandEl.querySelectorAll('.highlight')
      .forEach(el=>el.classList.remove('highlight'));
  }
  clearCenter() {
    this.centerEl.innerHTML = '';
  }
}

// Launch game on DOM ready
window.addEventListener('DOMContentLoaded', ()=> new Game());
```
