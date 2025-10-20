/* app.js
   Handles:
   - loading words.json
   - main deck rendering + swipe (looping)
   - bookmarks (toggle, sidebar list)
   - bookmarks overlay (full-screen, swipe through bookmarks, fixed header)
   - keyboard arrow nav (desktop)
   - initial nudge hint, snapback, smooth transitions
   - prevents page from scrolling on card swipes; only sidebar and overlay scroll vertically

   --- NEW CHANGES ---
   - ANIM_MS reduced for faster card swipe animation on mobile.
   - Deck shuffling implemented using shuffledIndices array, persisted via localStorage.
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
  const bmCounter = document.getElementById('bookmark-counter');
  const bmCloseBtn = document.getElementById('bookmark-close');
  const bmRemoveBtn = document.getElementById('bookmark-remove');

  // State
  let wordsData = [];
  let currentIndex = 0;
  let bookmarkedIndices = [];
  let lastIndexBeforeOverlay = null;
  // NEW: Array to store the shuffled order of indices
  let shuffledIndices = []; 
  let currentBookmarkIndex = 0;
  let isSwiping = false;
  let startX = 0;
  let startY = 0;
  let initialX = 0;

  // Timing (Reduced for faster mobile animation)
  const ANIM_MS = 150; 
  const SWIPE_THRESHOLD = 50;
  const NUDGE_DISTANCE = 30;

  // Utility Functions ------------------------------------------------------

  /** Shuffles array in-place using Fisher-Yates algorithm. */
  function shuffle(array) {
    let currentIndex = array.length, randomIndex;
    while (currentIndex !== 0) {
      randomIndex = Math.floor(Math.random() * currentIndex);
      currentIndex--;
      [array[currentIndex], array[randomIndex]] = [
        array[randomIndex], array[currentIndex]
      ];
    }
    return array;
  }

  // LocalStorage Helpers
  function saveLastIndex() {
    try {
      localStorage.setItem('lastIndex', currentIndex.toString());
    } catch (e) { console.warn('Could not save last index', e); }
  }

  function loadLastIndex() {
    try {
      const lastIndex = localStorage.getItem('lastIndex');
      if (lastIndex) {
        // Ensure loaded index is valid within the (shuffled) bounds
        const idx = parseInt(lastIndex, 10);
        if (idx >= 0 && idx < wordsData.length) {
          currentIndex = idx;
        }
      }
    } catch (e) { console.warn('Could not load last index', e); }
  }
  
  // NEW: Save the shuffled order to persistence
  function saveShuffledOrder() {
    try {
      localStorage.setItem('shuffledIndices', JSON.stringify(shuffledIndices));
    } catch (e) { console.warn('Could not save shuffled order', e); }
  }

  // NEW: Load the shuffled order from persistence
  function loadShuffledOrder() {
    try {
      const raw = localStorage.getItem('shuffledIndices');
      if (!raw) return false;
      const arr = JSON.parse(raw);
      // Only load if the stored array is an array and matches the current data length
      if (Array.isArray(arr) && arr.length === wordsData.length) {
        shuffledIndices = arr;
        return true;
      }
    } catch (e) { console.warn('Could not load shuffled order', e); }
    return false;
  }

  function saveBookmarksToStorage() {
    try {
      const bookmarksState = wordsData.map(d => d.isBookmarked);
      localStorage.setItem('bookmarks', JSON.stringify(bookmarksState));
    } catch (e) { console.warn('Could not save bookmarks', e); }
  }

  function loadBookmarksFromStorage() {
    try {
      const rawBookmarks = localStorage.getItem('bookmarks');
      if (rawBookmarks) {
        const bookmarksState = JSON.parse(rawBookmarks);
        // Apply saved bookmark state to wordsData
        if (Array.isArray(bookmarksState) && bookmarksState.length === wordsData.length) {
          wordsData.forEach((d, index) => {
            d.isBookmarked = bookmarksState[index];
          });
        }
      }
    } catch (e) { console.warn('Could not load bookmarks', e); }
  }

  // Card Rendering and Deck Navigation ---------------------------------------

  /** Gets the word item based on the current index in the SHUFFLED deck */
  function getCurrentWordItem() {
    if (!wordsData || wordsData.length === 0) return null;
    const originalWordIndex = shuffledIndices[currentIndex];
    return wordsData[originalWordIndex];
  }

  /** Gets the word item based on the index in the BOOKMARK list */
  function getBookmarkWordItem(index) {
    if (index < 0 || index >= bookmarkedIndices.length) return null;
    const originalWordIndex = bookmarkedIndices[index];
    return wordsData[originalWordIndex];
  }

  function highlightWord(text) {
    // Wrap any word found in <strong> tags with a highlight span
    return text.replace(/<strong>(.*?)<\/strong>/g, (match, word) => {
      return `<strong class="highlight">${word}</strong>`;
    });
  }

  function renderCard() {
    if (!wordsData || wordsData.length === 0) {
      wordDisplay.textContent = "Loading...";
      counter.textContent = "<0/0>";
      return;
    }

    // Get the item using the shuffled order
    const item = getCurrentWordItem();
    if (!item) return;

    // Populate main card
    wordDisplay.textContent = item.word;
    sentenceDisplay.innerHTML = highlightWord(item.sentence || '');
    meaningDisplay.textContent = item.english || '';
    rootDisplay.textContent = item.root || 'N/A';
    synonymsDisplay.textContent = (item.synonyms || []).join(', ') || 'N/A';

    // Update counter and storage
    counter.textContent = `<${currentIndex + 1}/${wordsData.length}>`;
    updateBookmarkIcon();
    saveLastIndex();
  }

  function changeCard(direction) {
    if (wordsData.length === 0 || isSwiping) return;

    currentIndex += direction;
    // Loop back to start/end
    if (currentIndex < 0) {
      currentIndex = wordsData.length - 1;
    } else if (currentIndex >= wordsData.length) {
      currentIndex = 0;
    }

    renderCard();
  }

  function updateBookmarkIcon() {
    if (!wordsData || wordsData.length === 0) return;
    const item = getCurrentWordItem(); // Use the shuffled order
    if (!item) return;

    const isBm = !!item.isBookmarked;
    bmFill.classList.toggle('hidden', !isBm);
    bmOutline.classList.toggle('hidden', isBm);
  }

  function toggleBookmark() {
    const item = getCurrentWordItem(); // Use the shuffled order
    if (!item) return;

    item.isBookmarked = !item.isBookmarked;
    saveBookmarksToStorage();
    updateBookmarkIcon();
    renderBookmarksList();
  }

  // Sidebar Bookmarks List -------------------------------------------------

  function renderBookmarksList() {
    bookmarksList.innerHTML = '';
    bookmarkedIndices = [];

    // Filter and collect bookmarked items, keeping track of their original indices
    wordsData.forEach((item, index) => {
      if (item.isBookmarked) {
        bookmarkedIndices.push(index);
        
        const li = document.createElement('li');
        li.className = 'flex justify-between items-center p-3 border-b border-gray-200 cursor-pointer hover:bg-white/50 transition-colors';
        li.setAttribute('data-index', index); // Original index of the word

        const wordText = document.createElement('span');
        wordText.textContent = item.word;
        wordText.className = 'font-semibold text-main flex-grow truncate';
        li.appendChild(wordText);

        const removeBtn = document.createElement('button');
        removeBtn.innerHTML = '✕';
        removeBtn.className = 'text-secondary hover:text-red-500 transition-colors ml-4 text-sm';
        removeBtn.addEventListener('click', (e) => {
          e.stopPropagation(); // Prevent li click
          // Since we use the ORIGINAL index from data-index
          const originalIdx = parseInt(li.getAttribute('data-index'), 10);
          wordsData[originalIdx].isBookmarked = false;
          saveBookmarksToStorage();
          // Update main card if it's the one being unbookmarked
          updateBookmarkIcon();
          renderBookmarksList(); 
        });
        li.appendChild(removeBtn);

        li.addEventListener('click', () => {
          // Open the full screen bookmark overlay
          openBookmarksOverlayAtIndex(bookmarkedIndices.indexOf(index));
        });

        bookmarksList.appendChild(li);
      }
    });

    // Update the counter in the sidebar header
    const countElement = document.getElementById('bookmark-count');
    if (countElement) {
        countElement.textContent = bookmarkedIndices.length;
    }
  }

  function closeSidebar() {
    sidebar.classList.remove('open');
    overlay.classList.remove('show');
  }

  // Fullscreen Bookmark Overlay --------------------------------------------

  function renderBookmarkCard() {
    const item = getBookmarkWordItem(currentBookmarkIndex);
    if (!item) {
      closeBookmarksOverlay();
      return;
    }

    // Populate bookmark card
    bmWordDisplay.textContent = item.word;
    bmSentenceDisplay.innerHTML = highlightWord(item.sentence || '');
    bmMeaningDisplay.textContent = item.english || '';
    bmRootDisplay.textContent = item.root || 'N/A';
    bmSynonymsDisplay.textContent = (item.synonyms || []).join(', ') || 'N/A';

    // Update counter
    bmCounter.textContent = `<${currentBookmarkIndex + 1}/${bookmarkedIndices.length}>`;

    // Update the remove button's original index
    bmRemoveBtn.setAttribute('data-original-index', bookmarkedIndices[currentBookmarkIndex]);
  }

  function changeBookmarkCard(direction) {
    if (bookmarkedIndices.length === 0 || isSwiping) return;

    currentBookmarkIndex += direction;
    // Loop back to start/end
    if (currentBookmarkIndex < 0) {
      currentBookmarkIndex = bookmarkedIndices.length - 1;
    } else if (currentBookmarkIndex >= bookmarkedIndices.length) {
      currentBookmarkIndex = 0;
    }
    renderBookmarkCard();
  }
  
  function openBookmarksOverlayAtIndex(bmIndex) {
    if (bookmarkedIndices.length === 0) return;

    closeSidebar();
    currentBookmarkIndex = bmIndex;
    renderBookmarkCard();
    bmOverlay.classList.add('active');
  }

  function closeBookmarksOverlay() {
    bmOverlay.classList.remove('active');
    // After closing, ensure the main card's bookmark icon is correct 
    // in case a word was removed in the overlay
    updateBookmarkIcon(); 
    renderBookmarksList(); // Re-render sidebar in case words were removed
  }

  function removeBookmarkFromOverlay() {
    const originalIdx = parseInt(bmRemoveBtn.getAttribute('data-original-index'), 10);
    if (isNaN(originalIdx) || originalIdx < 0 || originalIdx >= wordsData.length) return;

    wordsData[originalIdx].isBookmarked = false;
    saveBookmarksToStorage();
    
    // Check if the current word was the last one in the bookmark list
    if (bookmarkedIndices.length <= 1) {
      closeBookmarksOverlay();
      return;
    }

    // Adjust the current index if the word removed was the last one in the list
    if (currentBookmarkIndex >= bookmarkedIndices.length - 1) {
      currentBookmarkIndex = bookmarkedIndices.length - 2;
    }

    // Re-render the list and then the card to ensure the index is correct
    renderBookmarksList(); 
    renderBookmarkCard();
  }

  // Card Swipe Handlers ----------------------------------------------------

  function resetCardPosition(el, duration = ANIM_MS) {
    el.style.transition = `transform ${duration}ms ease-out`;
    el.style.transform = `translateX(0) translateY(0) rotate(0deg)`;
    setTimeout(() => {
      el.style.transition = '';
      isSwiping = false;
    }, duration);
  }

  function animateCardOut(el, direction) {
    isSwiping = true;
    const screenWidth = window.innerWidth;
    const finalX = direction === 1 ? screenWidth : -screenWidth;
    const rotation = direction === 1 ? 15 : -15;

    el.style.transition = `transform ${ANIM_MS}ms ease-in`;
    el.style.transform = `translateX(${finalX * 1.5}px) rotate(${rotation}deg)`;

    setTimeout(() => {
      resetCardPosition(el, 0); // Immediately reset position, but keep transition off
      changeCard(direction);
    }, ANIM_MS);
  }

  function attachSimpleSwipe(el, swipeFn) {
    el.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        e.preventDefault(); // Prevent page scroll on touch start
        isSwiping = true;
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        initialX = el.getBoundingClientRect().left;
        el.style.transition = 'none';
      }
    }, { passive: false });

    el.addEventListener('touchmove', (e) => {
      if (!isSwiping || e.touches.length !== 1) return;
      e.preventDefault(); // Prevent page scroll while swiping

      const currentX = e.touches[0].clientX;
      const deltaX = currentX - startX;
      const deltaY = e.touches[0].clientY - startY;

      // To prevent accidental vertical scrolling from triggering horizontal swipe
      if (Math.abs(deltaX) > Math.abs(deltaY) * 0.5) {
        const rotation = deltaX * 0.05;
        el.style.transform = `translateX(${deltaX}px) rotate(${rotation}deg)`;
      } else {
        // If movement is mostly vertical, stop dragging horizontally
        isSwiping = false; 
        resetCardPosition(el);
      }
    }, { passive: false });

    el.addEventListener('touchend', () => {
      if (!isSwiping) return;
      
      const currentX = el.getBoundingClientRect().left;
      const deltaX = currentX - initialX;

      if (Math.abs(deltaX) > SWIPE_THRESHOLD) {
        // Swipe detected
        const direction = deltaX > 0 ? 1 : -1;
        animateCardOut(el, direction);
      } else {
        // Snap back
        resetCardPosition(el);
      }
      isSwiping = false;
    });
  }

  function attachMouseSwipe(el, swipeFn) {
    let isMouseDown = false;
    let mouseDownX = 0;
    let initialLeft = 0;

    el.addEventListener('mousedown', (e) => {
      isMouseDown = true;
      e.preventDefault();
      mouseDownX = e.clientX;
      initialLeft = el.getBoundingClientRect().left;
      el.style.transition = 'none';
      isSwiping = true;
    });

    document.addEventListener('mousemove', (e) => {
      if (!isMouseDown) return;
      e.preventDefault();

      const deltaX = e.clientX - mouseDownX;
      const rotation = deltaX * 0.05;
      el.style.transform = `translateX(${deltaX}px) rotate(${rotation}deg)`;
    });

    document.addEventListener('mouseup', () => {
      if (!isMouseDown) return;
      isMouseDown = false;

      const currentLeft = el.getBoundingClientRect().left;
      const deltaX = currentLeft - initialLeft;

      if (Math.abs(deltaX) > SWIPE_THRESHOLD) {
        const direction = deltaX > 0 ? 1 : -1;
        animateCardOut(el, direction);
      } else {
        resetCardPosition(el);
      }
      isSwiping = false;
    });
  }
  
  // Initial Nudge Hint (Subtle visual feedback)
  function initialNudge() {
    if (currentIndex === 0 && wordsData.length > 1) {
      card.style.transition = `transform ${ANIM_MS * 2}ms ease-out`;
      card.style.transform = `translateX(${NUDGE_DISTANCE}px) rotate(3deg)`;
      setTimeout(() => {
        resetCardPosition(card, ANIM_MS * 2);
      }, ANIM_MS * 2);
    }
  }

  // Load words.json and initialize -----------------------------------------
  async function loadWords() {
    try {
      const resp = await fetch('words.json');
      const data = await resp.json();
      
      // 1. Convert to full wordsData array
      wordsData = data.map(d => Object.assign({}, d, { isBookmarked: !!d.isBookmarked }));
      
      // 2. Load/Create Shuffled Indices
      if (!loadShuffledOrder()) {
        // First load or storage was cleared: Create new shuffled order
        shuffledIndices = wordsData.map((_, index) => index); // [0, 1, 2, ...]
        shuffle(shuffledIndices); // Shuffle the indices
        saveShuffledOrder();
      }
      
      // 3. Load state from storage (bookmarks must load after wordsData is set)
      loadBookmarksFromStorage();
      loadLastIndex(); 

      // 4. Initial render
      renderCard();
      renderBookmarksList();
      initialNudge();

    } catch (err) {
      console.error('Could not load words.json', err);
      wordDisplay.textContent = "Error loading vocabulary data.";
    }
  }

  // Event Listeners --------------------------------------------------------

  // Main Card Swipe and Nav
  attachSimpleSwipe(card, changeCard);
  attachMouseSwipe(card, changeCard);

  // Bookmark toggling
  bookmarkBtn.addEventListener('click', toggleBookmark);

  // Menu/Sidebar
  menuBtn.addEventListener('click', () => {
    sidebar.classList.add('open');
    overlay.classList.add('show');
  });

  // Sidebar close (overlay click or the overlay's close button closes it)
  overlay.addEventListener('click', () => {
    // only closes sidebar overlay — bookmark overlay has separate close button
    closeSidebar();
  });

  // Bookmark Overlay Close
  bmCloseBtn.addEventListener('click', closeBookmarksOverlay);
  
  // Bookmark Overlay Remove Button
  bmRemoveBtn.addEventListener('click', removeBookmarkFromOverlay);

  // Bookmark Overlay Swipe and Nav
  attachSimpleSwipe(bmCard, changeBookmarkCard);
  attachMouseSwipe(bmCard, changeBookmarkCard);

  // Keyboard Navigation
  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') {
        if (bmOverlay.classList.contains('active')) {
            changeBookmarkCard(1);
        } else {
            changeCard(1);
        }
    } else if (e.key === 'ArrowLeft') {
        if (bmOverlay.classList.contains('active')) {
            changeBookmarkCard(-1);
        } else {
            changeCard(-1);
        }
    }
  });

  // Escape key closes overlays
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (bmOverlay.classList.contains('active')) {
        closeBookmarksOverlay();
      } else if (sidebar.classList.contains('open')) {
        closeSidebar();
      }
    }
  });

  // Bookmark overlay closes on background click
  bmOverlay.addEventListener('click', (ev) => {
    if (ev.target === bmOverlay) closeBookmarksOverlay();
  });

  // Initial load
  window.addEventListener('load', loadWords);

  // Expose a debug function (optional)
  window.__vocabDebug = {
    getWords: () => wordsData,
    getCurrentIndex: () => currentIndex,
    openBookmarksOverlayAtIndex,
    closeBookmarksOverlay
  };

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
