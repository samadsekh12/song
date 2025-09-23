// =========================
// Configuration Constants
// =========================
const AI_POINT_WEIGHTS = { ace: 4, king: 3, queen: 2, jack: 1 };
// delay in ms for AI to play a card
const AI_DECISION_DELAY = 800;
// toggle advanced bidding vs simple
const AI_ADVANCED_HEURISTIC = true;

// =========================
// Utility & Storage Helpers
// =========================
const STORAGE_KEY = 'callBreakState';

function loadState() {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
}
function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// =========================
// Domain Classes
// =========================
class Card {
  constructor(suit, rank) {
    this.suit = suit; // '♠','♥','♦','♣'
    this.rank = rank; // 2–10, 'J','Q','K','A'
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
    const suits = ['♠','♥','♦','♣'];
    const ranks = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
    suits.forEach(s => ranks.forEach(r => this.cards.push(new Card(s, r))));
  }
  shuffle() {
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
  }
  deal(players) {
    this.shuffle();
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

  // AI bidding heuristic based on HCP and distribution
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
      // advanced: reward long suits
      const suitCounts = this.hand.reduce((m, c) => {
        m[c.suit] = (m[c.suit] || 0) + 1;
        return m;
      }, {});
      const lengthBonus = Object.values(suitCounts).reduce((b, cnt) => b + Math.max(0, cnt - 4), 0);
      this.bid = Math.min(13, Math.floor(hcp / 2) + lengthBonus);
    }
  }

  playCard(leadingSuit) {
    // naive AI: follow suit if possible, else lowest card
    let candidates = this.hand.filter(c => c.suit === leadingSuit);
    if (candidates.length === 0) candidates = this.hand;
    // play highest to win if tricks < bid else throw lowest
    if (this.tricks < this.bid) {
      candidates.sort((a, b) => b.value - a.value);
    } else {
      candidates.sort((a, b) => a.value - b.value);
    }
    const chosen = candidates[0];
    this.hand = this.hand.filter(c => c !== chosen);
    return chosen;
  }
}

// =========================
// Main Game Controller
// =========================
class Game {
  constructor() {
    this.players = [
      new Player(0, true),
      new Player(1),
      new Player(2),
      new Player(3)
    ];
    this.dealerIndex = 0;
    this.round = 0;
    this.leadingSuit = null;
    this.playOrder = [];
    this.tableCards = [];
    this.state = loadState();
    this.restoreHistory();
    this.setupUI();
    this.startRound();
  }

  restoreHistory() {
    if (this.state.scores) {
      this.players.forEach((p, i) => p.score = this.state.scores[i] || 0);
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

  setupUI() {
    this.bidInput = document.getElementById('bidInput');
    this.submitBid = document.getElementById('submitBid');
    this.nextRound = document.getElementById('nextRound');
    this.resetHistory = document.getElementById('resetHistory');
    this.center = document.getElementById('center');
    this.scoreboard = document.getElementById('scoreboard');
    this.roundInfo = document.getElementById('roundInfo');
    this.playerHandEl = document.getElementById('playerHand');

    this.submitBid.addEventListener('click', () => this.onHumanBid());
    this.nextRound.addEventListener('click', () => this.startRound());
    this.resetHistory.addEventListener('click', () => this.resetGame());
    this.updateScoreboard();
  }

  startRound() {
    this.round++;
    this.leadingSuit = null;
    this.playOrder = [];
    this.tableCards = [];
    this.players.forEach(p => { p.hand = []; p.tricks = 0; });
    new Deck().deal(this.players);
    this.dealerIndex = (this.dealerIndex + 1) % 4;
    this.updateRoundInfo();
    this.renderHands();
    this.phase = 'bidding';
    this.submitBid.disabled = false;
    this.nextRound.disabled = true;
    this.players.slice(1).forEach(ai => ai.computeBid());
    this.renderBids(); // show AI bids immediately
  }

  onHumanBid() {
    const v = parseInt(this.bidInput.value, 10);
    if (isNaN(v) || v < 0 || v > 13) return;
    this.players[0].bid = v;
    this.submitBid.disabled = true;
    this.phase = 'playing';
    this.determineTurnOrder();
    this.playTrick();
  }

  determineTurnOrder() {
    // dealer leads next
    this.playOrder = [];
    for (let i = 1; i <= 4; i++) {
      this.playOrder.push((this.dealerIndex + i) % 4);
    }
  }

  playTrick() {
    if (this.players[0].hand.length === 0) {
      this.finishRound();
      return;
    }
    this.tableCards = [];
    this.leadingSuit = null;
    this.nextToPlay(0);
  }

  nextToPlay(idx) {
    const playerId = this.playOrder[idx];
    const player = this.players[playerId];

    if (player.isHuman) {
      this.highlightLegal();
      // click or drag events on cards below
    } else {
      setTimeout(() => {
        const card = player.playCard(this.leadingSuit);
        this.placeOnTable(playerId, card);
        this.nextToPlay(idx + 1);
      }, AI_DECISION_DELAY);
    }
  }

  // handle human card click
  onCardClick(evt) {
    const el = evt.currentTarget;
    const c = el.cardRef;
    if (this.isLegal(c)) {
      this.clearHighlights();
      this.playCardFromHand(c);
    }
  }

  playCardFromHand(card) {
    const human = this.players[0];
    human.hand = human.hand.filter(c => c !== card);
    this.placeOnTable(0, card);
    const idx = this.tableCards.length - 1;
    this.nextToPlay(idx);
  }

  placeOnTable(playerId, card) {
    if (!this.leadingSuit) this.leadingSuit = card.suit;
    this.tableCards.push({ playerId, card });
    this.renderTable();
    if (this.tableCards.length === 4) {
      setTimeout(() => this.resolveTrick(), 500);
    }
  }

  resolveTrick() {
    // winner is highest of leading suit
    const winning = this.tableCards
      .filter(t => t.card.suit === this.leadingSuit)
      .reduce((best, t) => (t.card.value > best.card.value ? t : best));
    this.players[winning.playerId].tricks++;
    this.dealerIndex = winning.playerId; // next dealer leads
    this.updateScoreboard();
    this.playTrick();
  }

  finishRound() {
    // scoring: +bid*10 if met, else -bid*10, extras +1 each
    this.players.forEach(p => {
      const delta = p.tricks >= p.bid
        ? p.bid * 10 + (p.tricks - p.bid)
        : -p.bid * 10;
      p.score += delta;
    });
    this.persistHistory();
    this.nextRound.disabled = false;
    this.updateScoreboard();
  }

  resetGame() {
    localStorage.removeItem(STORAGE_KEY);
    window.location.reload();
  }

  // ===== Rendering =====
  renderHands() {
    // human hand
    this.playerHandEl.innerHTML = '';
    this.players[0].hand.forEach(c => {
      const el = document.createElement('div');
      el.className = 'card draggable';
      el.draggable = true;
      el.tabIndex = 0;
      el.textContent = c.toString();
      el.cardRef = c;
      el.addEventListener('click', evt => this.onCardClick(evt));
      // keyboard support
      el.addEventListener('keydown', e => {
        if (e.key === 'Enter' && this.isLegal(c)) this.playCardFromHand(c);
      });
      this.playerHandEl.appendChild(el);
    });
  }

  renderTable() {
    this.center.innerHTML = '';
    this.tableCards.forEach((t, i) => {
      const el = document.createElement('div');
      el.className = 'card';
      el.textContent = t.card.toString();
      // offset each card
      const angle = (i - 1.5) * 15;
      el.style.transform = `translate(${i * 20 - 30}px,-20px) rotate(${angle}deg)`;
      this.center.appendChild(el);
    });
  }

  renderBids() {
    this.players.forEach((p, i) => {
      const el = document.querySelector(`#${i===0?'player':'ai'+i} .bid`);
      el.textContent = `Bid: ${p.bid}`;
    });
  }

  updateScoreboard() {
    this.scoreboard.innerHTML = this.players
      .map(p => `<div>Player ${p.id}: ${p.score}</div>`)
      .join('');
  }

  updateRoundInfo() {
    this.roundInfo.textContent = `Round ${this.round}, Dealer: Player ${this.dealerIndex}`;
  }

  // ===== Validation & Highlights =====
  isLegal(card) {
    if (!this.leadingSuit) return true;
    const hasSuit = this.players[0].hand.some(c => c.suit === this.leadingSuit);
    return !hasSuit || card.suit === this.leadingSuit;
  }
  highlightLegal() {
    this.clearHighlights();
    this.playerHandEl.querySelectorAll('.card').forEach(el => {
      if (this.isLegal(el.cardRef)) el.classList.add('highlight');
    });
  }
  clearHighlights() {
    this.playerHandEl.querySelectorAll('.highlight')
      .forEach(el => el.classList.remove('highlight'));
  }
}

// Initialize game on DOM ready
window.addEventListener('DOMContentLoaded', () => {
  if ('serviceWorker' in navigator) {
    // Inline service worker registration via Blob
    const swCode = `
      const CACHE = 'callbreak-v1';
      const ASSETS = ['.', 'index.html', 'styles.css', 'script.js'];
      self.addEventListener('install', e => {
        e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
      });
      self.addEventListener('fetch', e => {
        e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
      });
    `;
    const blob = new Blob([swCode], { type: 'text/javascript' });
    navigator.serviceWorker.register(URL.createObjectURL(blob))
      .catch(console.error);
  }
  new Game();
});
