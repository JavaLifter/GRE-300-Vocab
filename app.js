/* app.js
   Handles:
   - loading words.json
   - main deck rendering + swipe (looping)
   - bookmarks (toggle, sidebar list)
   - bookmarks overlay (full-screen, swipe through bookmarks, fixed header)
   - keyboard arrow nav (desktop)
   - initial nudge hint, snapback, smooth transitions
   - prevents page from scrolling on card swipes; only sidebar and overlay scroll vertically
*/
(() => {
  // Elements ---------------------------------------------------------------
  const card = document.getElementById('card');
  const wordDisplay = document.getElementById('word-display');
  const sentenceDisplay = document.getElementById('sentence-display');
  const meaningDisplay = document.getElementById('meaning-display');
  const rootDisplay = document.getElementById('root-display');
  const synonymsDisplay = document.getElementById('synonyms-display');
  const counter = document.getElementById('card-counter');
  const bookmarkBtn = document.getElementById('bookmark-btn');
  const bmOutline = document.getElementById('bm-outline');
  const bmFill = document.getElementById('bm-fill');

  const menuBtn = document.getElementById('menu-btn');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('overlay');
  const bookmarksList = document.getElementById('bookmarks-list');

  const bmOverlay = document.getElementById('bookmark-overlay');
  const bmCard = document.getElementById('bookmark-card');
  const bmWordDisplay = document.getElementById('bm-word-display');
  const bmSentenceDisplay = document.getElementById('bm-sentence-display');
  const bmMeaningDisplay = document.getElementById('bm-meaning-display');
  const bmRootDisplay = document.getElementById('bm-root-display');
  const bmSynonymsDisplay = document.getElementById('bm-synonyms-display');
  const bmCardCounter = document.getElementById('bm-card-counter');
  const bmClose = document.getElementById('bookmark-close');

  // State ------------------------------------------------------------------
  let wordsData = [];
  let currentIndex = 0;
  let bookmarkedIndices = [];
  let lastIndexBeforeOverlay = null;

  let bmList = [];
  let bmIndex = 0;

  // Timing -----------------------------------------------------------------
  const ANIM_MS = 100; // Faster animation
  const SWIPE_EASING = 'cubic-bezier(0.4, 0, 0.2, 1)';

  // Utility ----------------------------------------------------------------
  function clampIndex(i, len) {
    if (len === 0) return 0;
    return ((i % len) + len) % len;
  }

  function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function saveBookmarksToStorage() {
    try {
      const map = wordsData.map(w => !!w.isBookmarked);
      localStorage.setItem('bookmarks', JSON.stringify(map));
    } catch (e) { console.warn('Could not save bookmarks', e); }
  }

  function loadBookmarksFromStorage() {
    try {
      const raw = localStorage.getItem('bookmarks');
      if (!raw) return;
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        for (let i = 0; i < Math.min(arr.length, wordsData.length); i++) {
          wordsData[i].isBookmarked = !!arr[i];
        }
      }
    } catch (e) { console.warn('Could not load bookmarks', e); }
  }

  function saveLastIndex() {
    try { localStorage.setItem('lastIndex', String(currentIndex)); } catch (e) {}
  }
  function loadLastIndex() {
    try {
      const v = parseInt(localStorage.getItem('lastIndex'));
      if (!Number.isNaN(v)) currentIndex = clampIndex(v, wordsData.length);
    } catch (e) {}
  }

  // Rendering ---------------------------------------------------------------
  function renderCard() {
    if (!wordsData || wordsData.length === 0) {
      wordDisplay.textContent = '';
      sentenceDisplay.textContent = '';
      meaningDisplay.textContent = '';
      rootDisplay.textContent = '';
      synonymsDisplay.textContent = '';
      counter.textContent = `<0/0>`;
      return;
    }

    const item = wordsData[currentIndex];
    wordDisplay.textContent = item.word;

    try {
      const regex = new RegExp(`\\b${item.word}\\b`, 'gi');
      sentenceDisplay.innerHTML = item.sentence.replace(regex, match => `<span class="highlight">${match}</span>`);
    } catch {
      sentenceDisplay.innerHTML = item.sentence || '';
    }

    meaningDisplay.textContent = item.english || '';
    rootDisplay.textContent = item.root || '';
    synonymsDisplay.textContent = (item.synonyms || []).join(', ');
    counter.textContent = `<${currentIndex + 1}/${wordsData.length}>`;

    updateBookmarkIcon();
    saveLastIndex();
  }

  function updateBookmarkIcon() {
    if (!wordsData || wordsData.length === 0) return;
    const isBm = !!wordsData[currentIndex].isBookmarked;
    bmFill.classList.toggle('hidden', !isBm);
    bmOutline.classList.toggle('hidden', isBm);
  }

  function renderBookmarksList() {
    bookmarksList.innerHTML = '';
    bookmarkedIndices = [];
    wordsData.forEach((item, idx) => {
      if (item.isBookmarked) {
        bookmarkedIndices.push(idx);
        const li = document.createElement('li');
        li.className = 'flex items-center justify-between px-3 py-2 rounded bg-slate-100 hover:bg-slate-200';
        
        const wordSpan = document.createElement('span');
        wordSpan.textContent = item.word;
        wordSpan.className = 'cursor-pointer flex-grow';
        wordSpan.addEventListener('click', (ev) => {
          ev.preventDefault();
          openBookmarksOverlayAtIndex(bookmarkedIndices.indexOf(idx));
          closeSidebar();
        });
        
        const removeBtn = document.createElement('button');
        removeBtn.innerHTML = '✕';
        removeBtn.className = 'text-red-500 hover:text-red-700 font-bold text-lg px-2';
        removeBtn.setAttribute('aria-label', `Remove ${item.word} from bookmarks`);
        removeBtn.addEventListener('click', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          item.isBookmarked = false;
          renderBookmarksList();
          updateBookmarkIcon();
          saveBookmarksToStorage();
          if (bmOverlay.classList.contains('active')) {
            buildBookmarkList();
            renderBookmarkCard();
          }
        });
        
        li.appendChild(wordSpan);
        li.appendChild(removeBtn);
        bookmarksList.appendChild(li);
      }
    });
    saveBookmarksToStorage();
  }

  function toggleBookmark() {
    const item = wordsData[currentIndex];
    item.isBookmarked = !item.isBookmarked;
    updateBookmarkIcon();
    renderBookmarksList();
  }

  // Sidebar ---------------------------------------------------------------
  function openSidebar() {
    sidebar.classList.add('open');
    overlay.classList.add('show');
  }
  function closeSidebar() {
    sidebar.classList.remove('open');
    overlay.classList.remove('show');
  }

  menuBtn && menuBtn.addEventListener('click', openSidebar);
  overlay && overlay.addEventListener('click', closeSidebar);

  // Bookmark Overlay ------------------------------------------------------
  function buildBookmarkList() {
    bmList = wordsData.filter(w => w.isBookmarked);
  }

  function openBookmarksOverlayAtIndex(indexInBookmarks) {
    buildBookmarkList();
    if (!bmList || bmList.length === 0) return;
    bmIndex = clampIndex(indexInBookmarks || 0, bmList.length);
    lastIndexBeforeOverlay = currentIndex;
    renderBookmarkCard();
    document.body.style.transition = 'background-color 0.4s ease';
    document.body.style.backgroundColor = getComputedStyle(document.documentElement).getPropertyValue('--bm-bg');
    bmOverlay.classList.add('active');
    bmOverlay.style.overflowY = 'auto';
    bmOverlay.setAttribute('data-open', '1');
  }

  function closeBookmarksOverlay() {
    bmOverlay.classList.remove('active');
    document.body.style.backgroundColor = getComputedStyle(document.documentElement).getPropertyValue('--main-bg');
    bmOverlay.removeAttribute('data-open');
    lastIndexBeforeOverlay = null;
  }

  function renderBookmarkCard() {
    if (!bmList || bmList.length === 0) {
      bmWordDisplay.textContent = '';
      bmSentenceDisplay.textContent = '';
      bmMeaningDisplay.textContent = '';
      bmRootDisplay.textContent = '';
      bmSynonymsDisplay.textContent = '';
      bmCardCounter.textContent = `<0/0>`;
      return;
    }
    const item = bmList[clampIndex(bmIndex, bmList.length)];
    bmWordDisplay.textContent = item.word;
    try {
      const regex = new RegExp(`\\b${item.word}\\b`, 'gi');
      bmSentenceDisplay.innerHTML = item.sentence.replace(regex, match => `<span class="highlight">${match}</span>`);
    } catch {
      bmSentenceDisplay.innerHTML = item.sentence || '';
    }
    bmMeaningDisplay.textContent = item.english || '';
    bmRootDisplay.textContent = item.root || '';
    bmSynonymsDisplay.textContent = (item.synonyms || []).join(', ');
    bmCardCounter.textContent = `<${bmIndex + 1}/${bmList.length}>`;
  }

  bmClose && bmClose.addEventListener('click', closeBookmarksOverlay);

  // Navigation -------------------------------------------------------------
  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'Left') {
      e.preventDefault();
      bmOverlay.classList.contains('active') ? navigateBookmarks('prev') : navigateMain('prev');
    } else if (e.key === 'ArrowRight' || e.key === 'Right') {
      e.preventDefault();
      bmOverlay.classList.contains('active') ? navigateBookmarks('next') : navigateMain('next');
    }
  });

  function navigateMain(direction) {
    if (!wordsData || wordsData.length === 0) return;
    const len = wordsData.length;
    currentIndex = direction === 'next' ? clampIndex(currentIndex + 1, len) : clampIndex(currentIndex - 1, len);
    renderCard();
  }

  function navigateBookmarks(direction) {
    if (!bmList || bmList.length === 0) return;
    bmIndex = direction === 'next' ? clampIndex(bmIndex + 1, bmList.length) : clampIndex(bmIndex - 1, bmList.length);
    renderBookmarkCard();
  }

  // Swipe -----------------------------------------------------------------
  function attachSimpleSwipe(element, onSwipeLeft, onSwipeRight) {
    let startX = 0, currentX = 0, isSwiping = false;

    element.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return;
      startX = e.touches[0].clientX;
      currentX = startX;
      isSwiping = true;
      element.style.transition = 'none';
    }, { passive: true });

    element.addEventListener('touchmove', (e) => {
      if (!isSwiping) return;
      currentX = e.touches[0].clientX;
      const diff = currentX - startX;
      if (Math.abs(diff) > 10) e.preventDefault();
      element.style.transform = `translateX(${diff}px)`;
    }, { passive: false });

    element.addEventListener('touchend', () => {
      if (!isSwiping) return;
      isSwiping = false;
      const diff = currentX - startX;
      const threshold = 40;

      if (diff < -threshold) {
        element.style.transition = `transform ${ANIM_MS}ms ${SWIPE_EASING}`;
        element.style.transform = `translateX(-100%)`;
        setTimeout(() => {
          onSwipeLeft();
          element.style.transition = 'none';
          element.style.transform = 'translateX(0)';
        }, ANIM_MS);
      } else if (diff > threshold) {
        element.style.transition = `transform ${ANIM_MS}ms ${SWIPE_EASING}`;
        element.style.transform = `translateX(100%)`;
        setTimeout(() => {
          onSwipeRight();
          element.style.transition = 'none';
          element.style.transform = 'translateX(0)';
        }, ANIM_MS);
      } else {
        element.style.transition = `transform ${ANIM_MS}ms ${SWIPE_EASING}`;
        element.style.transform = 'translateX(0)';
      }
    }, { passive: true });
  }

  function attachMouseSwipe(element, onSwipeLeft, onSwipeRight) {
    let startX = 0, currentX = 0, isDragging = false;

    element.addEventListener('mousedown', (e) => {
      startX = e.clientX;
      currentX = startX;
      isDragging = true;
      element.style.transition = 'none';
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      currentX = e.clientX;
      const diff = currentX - startX;
      element.style.transform = `translateX(${diff}px)`;
    });

    document.addEventListener('mouseup', () => {
      if (!isDragging) return;
      isDragging = false;
      const diff = currentX - startX;
      const threshold = 60;

      if (diff < -threshold) {
        element.style.transition = `transform ${ANIM_MS}ms ${SWIPE_EASING}`;
        element.style.transform = `translateX(-100%)`;
        setTimeout(() => {
          onSwipeLeft();
          element.style.transition = 'none';
          element.style.transform = 'translateX(0)';
        }, ANIM_MS);
      } else if (diff > threshold) {
        element.style.transition = `transform ${ANIM_MS}ms ${SWIPE_EASING}`;
        element.style.transform = `translateX(100%)`;
        setTimeout(() => {
          onSwipeRight();
          element.style.transition = 'none';
          element.style.transform = 'translateX(0)';
        }, ANIM_MS);
      } else {
        element.style.transition = `transform ${ANIM_MS}ms ${SWIPE_EASING}`;
        element.style.transform = 'translateX(0)';
      }
    });
  }

  attachSimpleSwipe(card, () => navigateMain('next'), () => navigateMain('prev'));
  attachSimpleSwipe(bmCard, () => navigateBookmarks('next'), () => navigateBookmarks('prev'));
  attachMouseSwipe(card, () => navigateMain('next'), () => navigateMain('prev'));
  attachMouseSwipe(bmCard, () => navigateBookmarks('next'), () => navigateBookmarks('prev'));

  // Bookmark button --------------------------------------------------------
  bookmarkBtn && bookmarkBtn.addEventListener('click', () => {
    toggleBookmark();
    if (bmOverlay.classList.contains('active')) {
      buildBookmarkList();
      renderBookmarkCard();
      renderBookmarksList();
    }
  });

  // Initial hint -----------------------------------------------------------
  function initialNudge() {
    try {
      if (localStorage.getItem('seenHint') === '1') return;
      card.style.transition = `transform 400ms ease-out`;
      card.style.transform = 'translateX(-12px)';
      setTimeout(() => {
        card.style.transform = 'translateX(0)';
        localStorage.setItem('seenHint', '1');
      }, 420);
    } catch {}
  }

  // Load words -------------------------------------------------------------
  async function loadWords() {
    try {
      const resp = await fetch('words.json');
      let data = await resp.json();

      const stored = localStorage.getItem('shuffledWords');
      if (stored) {
        wordsData = JSON.parse(stored);
      } else {
        wordsData = shuffleArray(data).map(d => Object.assign({}, d, { isBookmarked: !!d.isBookmarked }));
        localStorage.setItem('shuffledWords', JSON.stringify(wordsData));
      }

      loadBookmarksFromStorage();
      loadLastIndex();
      renderCard();
      renderBookmarksList();
      initialNudge();
    } catch (err) {
      console.error('Could not load words.json', err);
    }
  }

  loadWords();

  // Prevent scroll on card swipes
  document.addEventListener('touchmove', () => {}, { passive: true });

  overlay.addEventListener('click', closeSidebar);

  window.__vocabDebug = {
    getWords: () => wordsData,
    getCurrentIndex: () => currentIndex,
    openBookmarksOverlayAtIndex,
    closeBookmarksOverlay
  };

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (bmOverlay.classList.contains('active')) closeBookmarksOverlay();
      else if (sidebar.classList.contains('open')) closeSidebar();
    }
  });

  bmOverlay.addEventListener('click', (ev) => {
    if (ev.target === bmOverlay) closeBookmarksOverlay();
  });

  // Service Worker --------------------------------------------------------
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/service-worker.js')
        .then(reg => console.log('SW registered:', reg))
        .catch(err => console.log('SW registration failed:', err));
    });
  }

})();
