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
  // Elements
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

  // State
  let wordsData = [];
  let currentIndex = 0;
  let bookmarkedIndices = []; // indices in wordsData for bookmarked items
  let lastIndexBeforeOverlay = null;

  // Bookmark overlay state
  let bmList = []; // array of items (references to objects from wordsData)
  let bmIndex = 0; // index inside bmList

  // Gesture tracking
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let currentTranslate = 0;
  const SWIPE_THRESHOLD_PX = 80; // min px to count as swipe (will also adapt to width)

  // Easing and timing (match CSS)
  const TRANSITION_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
  const ANIM_MS = 320;

  // Utility -----------------------------------------------------------------
  function clampIndex(i, len) {
    if (len === 0) return 0;
    return ((i % len) + len) % len;
  }

  function saveBookmarksToStorage() {
    // Save boolean map of bookmarks (keeps persistent across sessions)
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
        // apply, safeguarding lengths
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
    // Sentence may contain HTML (words.json uses <strong> tags). We'll use innerHTML,
    // and additionally highlight the raw word occurrences (safe-ish because data is trusted local file).
    
    try {
  // Create a regex that matches the word with any capitalization
  const regex = new RegExp(`\\b${item.word}\\b`, 'gi');
  sentenceDisplay.innerHTML = item.sentence.replace(regex, (match) => {
    return `<span class="highlight">${match}</span>`;
  });
} catch (e) {
  sentenceDisplay.innerHTML = item.sentence || '';
}

    meaningDisplay.textContent = item.english || '';
    rootDisplay.textContent = item.root || '';
    synonymsDisplay.textContent = (item.synonyms || []).join(', ');
    // antonyms intentionally omitted
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
      
      // Word text (clickable to open in overlay)
      const wordSpan = document.createElement('span');
      wordSpan.textContent = item.word;
      wordSpan.className = 'cursor-pointer flex-grow';
      wordSpan.addEventListener('click', (ev) => {
        ev.preventDefault();
        openBookmarksOverlayAtIndex(bookmarkedIndices.indexOf(idx));
        closeSidebar();
      });
      
      // Remove button (cross icon)
      const removeBtn = document.createElement('button');
      removeBtn.innerHTML = '✕';
      removeBtn.className = 'text-red-500 hover:text-red-700 font-bold text-lg px-2';
      removeBtn.setAttribute('aria-label', `Remove ${item.word} from bookmarks`);
      removeBtn.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation(); // Prevent triggering the wordSpan click
        item.isBookmarked = false;
        renderBookmarksList(); // Re-render the list
        updateBookmarkIcon(); // Update main card icon if needed
        saveBookmarksToStorage();
        
        // If bookmark overlay is open, refresh it
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

  // Sidebar open / close ----------------------------------------------------
  function openSidebar() {
    sidebar.classList.add('open');
    overlay.classList.add('show');
  }
  function closeSidebar() {
    sidebar.classList.remove('open');
    overlay.classList.remove('show');
  }

  menuBtn && menuBtn.addEventListener('click', openSidebar);
  overlay && overlay.addEventListener('click', () => {
    // overlay used to close sidebar or overlay - close sidebar only
    closeSidebar();
  });

  // Bookmark overlay (full-screen) -----------------------------------------
  function buildBookmarkList() {
    bmList = wordsData.filter(w => w.isBookmarked);
  }
  function openBookmarksOverlayAtIndex(indexInBookmarks) {
    buildBookmarkList();
    if (!bmList || bmList.length === 0) return;
    bmIndex = clampIndex(indexInBookmarks || 0, bmList.length);
    lastIndexBeforeOverlay = currentIndex;
    renderBookmarkCard();
    // fade body background to overlay's tone for subtle transition
    document.body.style.transition = 'background-color 0.4s ease';
    document.body.style.backgroundColor = getComputedStyle(document.documentElement).getPropertyValue('--bm-bg');
    bmOverlay.classList.add('active'); // CSS shows it (index.html uses .active in assistant-provided HTML)
    // ensure overlay can scroll vertically if content exceeds height
    bmOverlay.style.overflowY = 'auto';
    // set focus so arrow keys navigate overlay
    bmOverlay.setAttribute('data-open', '1');
  }
  function closeBookmarksOverlay() {
    bmOverlay.classList.remove('active');
    // restore body bg to main deck
    document.body.style.backgroundColor = getComputedStyle(document.documentElement).getPropertyValue('--main-bg');
    bmOverlay.removeAttribute('data-open');
    // return to previous card (no change)
    if (lastIndexBeforeOverlay !== null) {
      // nothing to do: main card index unchanged. Keep previousIndex for clarity.
      lastIndexBeforeOverlay = null;
    }
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
  bmSentenceDisplay.innerHTML = item.sentence.replace(regex, (match) => {
    return `<span class="highlight">${match}</span>`;
  });
} catch (e) { bmSentenceDisplay.innerHTML = item.sentence || ''; }    
    bmMeaningDisplay.textContent = item.english || '';
    bmRootDisplay.textContent = item.root || '';
    bmSynonymsDisplay.textContent = (item.synonyms || []).join(', ');
    bmCardCounter.textContent = `<${bmIndex + 1}/${bmList.length}>`;
    // update bookmark icon on overlay card if you plan to add toggle there later
  }

  // Bookmark overlay close button
  bmClose && bmClose.addEventListener('click', closeBookmarksOverlay);

  // Keyboard navigation
  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'Left') {
      e.preventDefault();
      if (bmOverlay.classList.contains('active')) {
        navigateBookmarks('prev');
      } else {
        navigateMain('prev');
      }
    } else if (e.key === 'ArrowRight' || e.key === 'Right') {
      e.preventDefault();
      if (bmOverlay.classList.contains('active')) {
        navigateBookmarks('next');
      } else {
        navigateMain('next');
      }
    }
  });

  // Navigation functions with nice animation --------------------------------
  function animateMainTransition(direction, newIndex) {
    if (!card) return;
    const width = card.offsetWidth || 300;
    const outX = direction === 'next' ? -window.innerWidth : window.innerWidth;

    // animate out
    card.style.transition = `transform ${ANIM_MS}ms ${TRANSITION_EASE}, opacity ${ANIM_MS}ms ease`;
    card.style.transform = `translateX(${outX}px)`;
    card.style.opacity = '0';

    setTimeout(() => {
      // swap content
      currentIndex = clampIndex(newIndex, wordsData.length);
      renderCard();

      // place offscreen on the opposite side
      card.style.transition = 'none';
      const inX = direction === 'next' ? window.innerWidth : -window.innerWidth;
      card.style.transform = `translateX(${inX}px)`;
      card.style.opacity = '1';

      // force repaint then animate back to center
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          card.style.transition = `transform ${ANIM_MS}ms ${TRANSITION_EASE}`;
          card.style.transform = 'translateX(0)';
        });
      });
    }, ANIM_MS);
  }

  function navigateMain(direction) {
    if (!wordsData || wordsData.length === 0) return;
    const len = wordsData.length;
    const nextIndex = direction === 'next' ? clampIndex(currentIndex + 1, len) : clampIndex(currentIndex - 1, len);
    animateMainTransition(direction, nextIndex);
  }

  function animateBookmarkTransition(direction, newBmIndex) {
    if (!bmCard) return;
    const outX = direction === 'next' ? -window.innerWidth : window.innerWidth;
    bmCard.style.transition = `transform ${ANIM_MS}ms ${TRANSITION_EASE}, opacity ${ANIM_MS}ms ease`;
    bmCard.style.transform = `translateX(${outX}px)`;
    bmCard.style.opacity = '0';

    setTimeout(() => {
      bmIndex = clampIndex(newBmIndex, bmList.length);
      renderBookmarkCard();

      bmCard.style.transition = 'none';
      const inX = direction === 'next' ? window.innerWidth : -window.innerWidth;
      bmCard.style.transform = `translateX(${inX}px)`;
      bmCard.style.opacity = '1';

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          bmCard.style.transition = `transform ${ANIM_MS}ms ${TRANSITION_EASE}`;
          bmCard.style.transform = 'translateX(0)';
        });
      });
    }, ANIM_MS);
  }

  function navigateBookmarks(direction) {
    if (!bmList || bmList.length === 0) return;
    const nextBmIndex = direction === 'next' ? clampIndex(bmIndex + 1, bmList.length) : clampIndex(bmIndex - 1, bmList.length);
    animateBookmarkTransition(direction, nextBmIndex);
  }

  // Touch handling for card (main deck) ------------------------------------
  function attachTouchHandlers(element, onNavigateNext, onNavigatePrev) {
    let localDragging = false;
    let sX = 0;
    let sY = 0;
    let dx = 0;
    let dy = 0;

    element.addEventListener('touchstart', (ev) => {
      if (!ev.touches || ev.touches.length !== 1) return;
      localDragging = true;
      sX = ev.touches[0].clientX;
      sY = ev.touches[0].clientY;
      element.style.transition = 'none';
      // capture variables in outer scope
      dragging = true;
      startX = sX;
      startY = sY;
      currentTranslate = 0;
    }, {passive: true});

    element.addEventListener('touchmove', (ev) => {
      if (!localDragging) return;
      const t = ev.touches[0];
      dx = t.clientX - sX;
      dy = t.clientY - sY;

      // if horizontal movement is dominant, prevent page from also panning
      if (Math.abs(dx) > Math.abs(dy)) {
        ev.preventDefault(); // IMPORTANT: stops page from moving (only card moves)
        currentTranslate = dx;
        // rotate slightly for fun
        const rotate = dx / 20;
        element.style.transform = `translateX(${dx}px) rotate(${rotate}deg)`;
      } else {
        // vertical gesture — do nothing here (sidebar/overlay will handle vertical scrolling)
        // but we don't want to allow page scroll, page body is hidden in our CSS
      }
    }, {passive: false});

    element.addEventListener('touchend', (ev) => {
      if (!localDragging) return;
      localDragging = false;
      dragging = false;

      const width = element.offsetWidth || window.innerWidth;
      const threshold = Math.max(SWIPE_THRESHOLD_PX, width * 0.20);

      if (currentTranslate <= -threshold) {
        // swipe left = next
        element.style.transition = `transform ${ANIM_MS}ms ${TRANSITION_EASE}, opacity ${ANIM_MS}ms ease`;
        element.style.transform = `translateX(${-window.innerWidth}px)`;
        setTimeout(() => onNavigateNext(), ANIM_MS);
      } else if (currentTranslate >= threshold) {
        // swipe right = prev
        element.style.transition = `transform ${ANIM_MS}ms ${TRANSITION_EASE}, opacity ${ANIM_MS}ms ease`;
        element.style.transform = `translateX(${window.innerWidth}px)`;
        setTimeout(() => onNavigatePrev(), ANIM_MS);
      } else {
        // snapback
        element.style.transition = `transform ${ANIM_MS}ms ${TRANSITION_EASE}`;
        element.style.transform = 'translateX(0)';
      }
      currentTranslate = 0;
    }, {passive: true});
  }

  // Attach touch handlers to main card and bookmark card
  attachTouchHandlers(card, () => navigateMain('next'), () => navigateMain('prev'));
  attachTouchHandlers(bmCard, () => navigateBookmarks('next'), () => navigateBookmarks('prev'));

  // Desktop mouse dragging (optional): allow click-drag on desktop for convenience
  (function attachMouseDragDesktop(el, onNext, onPrev) {
    let isDown = false;
    let sX = 0;
    let sY = 0;
    let moved = 0;
    el.addEventListener('mousedown', (ev) => {
      isDown = true;
      sX = ev.clientX;
      sY = ev.clientY;
      el.style.transition = 'none';
    });
    window.addEventListener('mousemove', (ev) => {
      if (!isDown) return;
      const dx = ev.clientX - sX;
      moved = dx;
      el.style.transform = `translateX(${dx}px) rotate(${dx/20}deg)`;
    });
    window.addEventListener('mouseup', (ev) => {
      if (!isDown) return;
      isDown = false;
      const thresh = Math.max(SWIPE_THRESHOLD_PX, (el.offsetWidth || window.innerWidth) * 0.2);
      if (moved <= -thresh) {
        el.style.transition = `transform ${ANIM_MS}ms ${TRANSITION_EASE}, opacity ${ANIM_MS}ms ease`;
        el.style.transform = `translateX(${-window.innerWidth}px)`;
        setTimeout(onNext, ANIM_MS);
      } else if (moved >= thresh) {
        el.style.transition = `transform ${ANIM_MS}ms ${TRANSITION_EASE}, opacity ${ANIM_MS}ms ease`;
        el.style.transform = `translateX(${window.innerWidth}px)`;
        setTimeout(onPrev, ANIM_MS);
      } else {
        el.style.transition = `transform ${ANIM_MS}ms ${TRANSITION_EASE}`;
        el.style.transform = `translateX(0)`;
      }
      moved = 0;
    });
  })(card, () => navigateMain('next'), () => navigateMain('prev'));

  (function attachMouseDragDesktopBM() {
    // separate small wrapper for bookmark card
    const el = bmCard;
    let isDown = false, sX = 0, moved = 0;
    el.addEventListener('mousedown', (ev) => {
      isDown = true;
      sX = ev.clientX;
      el.style.transition = 'none';
    });
    window.addEventListener('mousemove', (ev) => {
      if (!isDown) return;
      const dx = ev.clientX - sX;
      moved = dx;
      el.style.transform = `translateX(${dx}px) rotate(${dx/20}deg)`;
    });
    window.addEventListener('mouseup', (ev) => {
      if (!isDown) return;
      isDown = false;
      const thresh = Math.max(SWIPE_THRESHOLD_PX, (el.offsetWidth || window.innerWidth) * 0.2);
      if (moved <= -thresh) {
        el.style.transition = `transform ${ANIM_MS}ms ${TRANSITION_EASE}, opacity ${ANIM_MS}ms ease`;
        el.style.transform = `translateX(${-window.innerWidth}px)`;
        setTimeout(() => navigateBookmarks('next'), ANIM_MS);
      } else if (moved >= thresh) {
        el.style.transition = `transform ${ANIM_MS}ms ${TRANSITION_EASE}, opacity ${ANIM_MS}ms ease`;
        el.style.transform = `translateX(${window.innerWidth}px)`;
        setTimeout(() => navigateBookmarks('prev'), ANIM_MS);
      } else {
        el.style.transition = `transform ${ANIM_MS}ms ${TRANSITION_EASE}`;
        el.style.transform = `translateX(0)`;
      }
      moved = 0;
    });
  })();

  // Hook up bookmark button
  bookmarkBtn && bookmarkBtn.addEventListener('click', () => {
    toggleBookmark();
    // refresh bookmark overlay list if it's open
    if (bmOverlay.classList.contains('active')) {
      buildBookmarkList();
      renderBookmarkCard();
      renderBookmarksList();
    }
  });

  // Initial "swipe hint" nudge (only once)
  function initialNudge() {
    try {
      if (localStorage.getItem('seenHint') === '1') return;
      // small left nudge and back
      card.style.transition = `transform 400ms ${TRANSITION_EASE}`;
      card.style.transform = 'translateX(-12px)';
      setTimeout(() => {
        card.style.transform = 'translateX(0)';
        localStorage.setItem('seenHint', '1');
      }, 420);
    } catch (e) { /* ignore */ }
  }

  // Load words.json and initialize -----------------------------------------
  async function loadWords() {
    try {
      const resp = await fetch('words.json');
      const data = await resp.json();
      // ensure isBookmarked exists
      wordsData = data.map(d => Object.assign({}, d, { isBookmarked: !!d.isBookmarked }));
      // load bookmark map and last index if present
      loadBookmarksFromStorage();
      loadLastIndex();
      renderCard();
      renderBookmarksList();
      initialNudge();
    } catch (err) {
      console.error('Could not load words.json', err);
    }
  }

  // init
  loadWords();

  // Make sure main card doesn't cause page scrolling on mobile:
  // (index.html sets body overflow hidden already; but if not, we ensure the card handles horizontal only)
  document.addEventListener('touchmove', (e) => {
    // do nothing here — touchmove handlers on card preventDefault when horizontal.
    // we keep this listener passive to avoid interfering.
  }, {passive: true});


  // Small niceties: clicking bookmark item in sidebar will open overlay at that bookmark (handled in renderBookmarksList)
  // clicking outside the overlay's close or the overlay's close button closes it:
  overlay.addEventListener('click', () => {
    // only closes sidebar overlay — bookmark overlay has separate close button
    closeSidebar();
  });

  // Expose a debug function (optional)
  window.__vocabDebug = {
    getWords: () => wordsData,
    getCurrentIndex: () => currentIndex,
    openBookmarksOverlayAtIndex,
    closeBookmarksOverlay
  };

  // Ensure the bookmark overlay has keyboard close via Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (bmOverlay.classList.contains('active')) {
        closeBookmarksOverlay();
      } else if (sidebar.classList.contains('open')) {
        closeSidebar();
      }
    }
  });

  // Ensure bookmark overlay closes on background click (optional but convenient)
  bmOverlay.addEventListener('click', (ev) => {
    // only close if user clicked the background area (not the card)
    // detect if the click target is the overlay itself (or the header area outside card)
    if (ev.target === bmOverlay) closeBookmarksOverlay();
  });

})();
