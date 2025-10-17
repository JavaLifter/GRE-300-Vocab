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

  // Timing
  const ANIM_MS = 300;

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
  function navigateMain(direction) {
    if (!wordsData || wordsData.length === 0) return;
    const len = wordsData.length;
    const nextIndex = direction === 'next' ? clampIndex(currentIndex + 1, len) : clampIndex(currentIndex - 1, len);
    
    // Simple content update without complex animation
    currentIndex = nextIndex;
    renderCard();
  }

  function navigateBookmarks(direction) {
    if (!bmList || bmList.length === 0) return;
    const nextBmIndex = direction === 'next' ? clampIndex(bmIndex + 1, bmList.length) : clampIndex(bmIndex - 1, bmList.length);
    
    // Simple content update
    bmIndex = nextBmIndex;
    renderBookmarkCard();
  }

  // Simple swipe handlers
  function attachSimpleSwipe(element, onSwipeLeft, onSwipeRight) {
    let startX = 0;
    let currentX = 0;
    let isSwiping = false;

    // Touch events
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
      
      // Only move horizontally, prevent vertical scrolling during horizontal swipe
      if (Math.abs(diff) > 10) {
        e.preventDefault();
      }
      
      element.style.transform = `translateX(${diff}px)`;
    }, { passive: false });

    element.addEventListener('touchend', () => {
      if (!isSwiping) return;
      isSwiping = false;

      const diff = currentX - startX;
      const threshold = 60; // Reduced threshold for better mobile feel

      if (diff < -threshold) {
        // Swipe left - next
        element.style.transition = `transform ${ANIM_MS}ms ease-out`;
        element.style.transform = `translateX(-100%)`;
        setTimeout(() => {
          onSwipeLeft();
          // Reset position after navigation
          element.style.transition = 'none';
          element.style.transform = 'translateX(0)';
        }, ANIM_MS);
      } else if (diff > threshold) {
        // Swipe right - prev
        element.style.transition = `transform ${ANIM_MS}ms ease-out`;
        element.style.transform = `translateX(100%)`;
        setTimeout(() => {
          onSwipeRight();
          // Reset position after navigation
          element.style.transition = 'none';
          element.style.transform = 'translateX(0)';
        }, ANIM_MS);
      } else {
        // Return to center
        element.style.transition = `transform ${ANIM_MS}ms ease-out`;
        element.style.transform = 'translateX(0)';
      }
    }, { passive: true });
  }

  // Mouse events for desktop
  function attachMouseSwipe(element, onSwipeLeft, onSwipeRight) {
    let startX = 0;
    let currentX = 0;
    let isDragging = false;

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
        element.style.transition = `transform ${ANIM_MS}ms ease-out`;
        element.style.transform = `translateX(-100%)`;
        setTimeout(() => {
          onSwipeLeft();
          element.style.transition = 'none';
          element.style.transform = 'translateX(0)';
        }, ANIM_MS);
      } else if (diff > threshold) {
        element.style.transition = `transform ${ANIM_MS}ms ease-out`;
        element.style.transform = `translateX(100%)`;
        setTimeout(() => {
          onSwipeRight();
          element.style.transition = 'none';
          element.style.transform = 'translateX(0)';
        }, ANIM_MS);
      } else {
        element.style.transition = `transform ${ANIM_MS}ms ease-out`;
        element.style.transform = 'translateX(0)';
      }
    });
  }

  // Attach swipe handlers to main card and bookmark card
  attachSimpleSwipe(card, () => navigateMain('next'), () => navigateMain('prev'));
  attachSimpleSwipe(bmCard, () => navigateBookmarks('next'), () => navigateBookmarks('prev'));

  // Also attach mouse events for desktop
  attachMouseSwipe(card, () => navigateMain('next'), () => navigateMain('prev'));
  attachMouseSwipe(bmCard, () => navigateBookmarks('next'), () => navigateBookmarks('prev'));

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
      card.style.transition = `transform 400ms ease-out`;
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

  // Register service worker for PWA
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/service-worker.js')
        .then((registration) => {
          console.log('SW registered: ', registration);
        })
        .catch((registrationError) => {
          console.log('SW registration failed: ', registrationError);
        });
    });
  }

})();
