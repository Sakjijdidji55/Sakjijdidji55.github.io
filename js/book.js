/* 书架进度、章节筛选、阅读进度等前端交互 */
(function () {
  'use strict';

  var STORAGE_PREFIX = 'book-progress-v1:';
  var doc = document;
  var root = doc.documentElement;

  function qs(selector, scope) {
    return (scope || doc).querySelector(selector);
  }

  function qsa(selector, scope) {
    return Array.prototype.slice.call((scope || doc).querySelectorAll(selector));
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function readState(book) {
    var empty = { read: [], last: '', updated: 0 };
    if (!book) return empty;

    try {
      var raw = window.localStorage.getItem(STORAGE_PREFIX + book);
      if (!raw) return empty;
      var data = JSON.parse(raw);
      if (!data || typeof data !== 'object') return empty;
      return {
        read: Array.isArray(data.read) ? data.read.filter(function (item, index, list) {
          return typeof item === 'string' && list.indexOf(item) === index;
        }) : [],
        last: typeof data.last === 'string' ? data.last : '',
        updated: typeof data.updated === 'number' ? data.updated : 0
      };
    } catch (err) {
      return empty;
    }
  }

  function writeState(book, state) {
    if (!book) return;
    state.updated = Date.now();
    try {
      window.localStorage.setItem(STORAGE_PREFIX + book, JSON.stringify(state));
    } catch (err) {
      /* 隐私模式或存储已满时静默失败 */
    }
  }

  function progressText(count, total, verbose) {
    if (!total) return '未开始';
    if (!count) return '未开始';
    if (count >= total) return '已读完';
    if (verbose) return '已读 ' + count + ' / ' + total + ' 章 · ' + Math.round((count / total) * 100) + '%';
    return '已读 ' + count + '/' + total;
  }

  function paintProgress(el, state, total) {
    if (!el) return;
    var count = Math.min(state.read.length, total);
    var percent = total ? Math.round((count / total) * 100) : 0;
    var bar = qs('.book-progress-track > i', el);
    var label = qs('.book-progress-label', el);
    if (bar) bar.style.width = percent + '%';
    if (label) label.textContent = progressText(count, total, el.classList.contains('book-hero-progress'));
  }

  function paintReaderProgress(reader, state, total) {
    var count = Math.min(state.read.length, total);
    var percent = total ? Math.round((count / total) * 100) : 0;
    var bar = qs('[data-sidebar-progress]', reader);
    var label = qs('[data-sidebar-label]', reader);
    if (bar) bar.style.width = percent + '%';
    if (label) label.textContent = progressText(count, total, false);
  }

  function applyReadMarks(scope, state) {
    qsa('[data-chapter-item]', scope).forEach(function (item) {
      var slug = item.getAttribute('data-chapter-item');
      item.classList.toggle('is-read', state.read.indexOf(slug) !== -1);
    });
  }

  function showToast(message) {
    var el = qs('.book-toast');
    if (!el) {
      el = doc.createElement('div');
      el.className = 'book-toast';
      doc.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.add('is-show');
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(function () {
      el.classList.remove('is-show');
    }, 1900);
  }

  /* ------------------------------------------------------------------ */
  /* 书架                                                                */
  /* ------------------------------------------------------------------ */

  function initShelf() {
    var shelf = qs('.book-shelf-page');
    if (!shelf) return;

    qsa('[data-book-progress]', shelf).forEach(function (el) {
      var book = el.getAttribute('data-book-progress');
      var total = Number(el.getAttribute('data-total')) || 0;
      paintProgress(el, readState(book), total);
    });

    var input = qs('[data-shelf-filter]', shelf);
    var grid = qs('[data-shelf-grid]', shelf);
    var empty = qs('[data-shelf-empty]', shelf);

    if (!input || !grid) return;

    input.addEventListener('input', function () {
      var keyword = input.value.trim().toLowerCase();
      var visible = 0;

      qsa('[data-book-card]', grid).forEach(function (card) {
        var haystack = (card.textContent + ' ' + (card.getAttribute('data-book-tags') || '')).toLowerCase();
        var matched = !keyword || haystack.indexOf(keyword) !== -1;
        card.hidden = !matched;
        if (matched) visible++;
      });

      if (empty) empty.hidden = visible !== 0;
    });
  }

  /* ------------------------------------------------------------------ */
  /* 书籍首页                                                            */
  /* ------------------------------------------------------------------ */

  function initBookHome() {
    var home = qs('[data-book-home]');
    if (!home) return;

    var book = home.getAttribute('data-book');
    var total = Number(home.getAttribute('data-total')) || 0;
    var state = readState(book);

    paintProgress(qs('[data-book-progress]', home), state, total);
    applyReadMarks(home, state);

    var continueBtn = qs('#book-continue');
    if (continueBtn && state.last) {
      var target = null;
      qsa('[data-chapter-link]', home).some(function (link) {
        if (link.getAttribute('data-chapter-link') === state.last) {
          target = link.getAttribute('href');
          return true;
        }
        return false;
      });
      if (target) {
        continueBtn.setAttribute('href', target);
        continueBtn.innerHTML = '<i class="fas fa-book-open"></i> 继续阅读';
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* 阅读页                                                              */
  /* ------------------------------------------------------------------ */

  function initReader() {
    var reader = qs('[data-book-reader]');
    if (!reader) return;

    var book = reader.getAttribute('data-book');
    var chapter = reader.getAttribute('data-chapter');
    var total = Number(reader.getAttribute('data-total')) || 0;
    var state = readState(book);
    var content = qs('[data-book-content]', reader);
    var nav = qs('[data-book-nav]', reader);
    var bar = qs('[data-reading-bar] > i', reader);
    var markButtons = qsa('[data-mark-read]', reader);
    var autoMarked = false;
    var suppressAuto = false;

    // 记录当前章节，供「继续阅读」使用
    state.last = chapter;
    writeState(book, state);

    paintReaderProgress(reader, state, total);
    applyReadMarks(reader.parentNode || doc, state);

    function refreshMarks() {
      var isRead = state.read.indexOf(chapter) !== -1;

      markButtons.forEach(function (button) {
        var icon = qs('i', button);
        var label = qs('span', button);
        button.classList.toggle('is-read', isRead);
        button.setAttribute('aria-pressed', isRead ? 'true' : 'false');
        if (icon) icon.className = isRead ? 'fas fa-circle-check' : 'far fa-circle-check';
        if (label) {
          if (button.classList.contains('book-mark-btn')) {
            label.textContent = isRead ? '已读' : '标记已读';
          } else {
            label.textContent = isRead ? '已读本章' : '标记本章已读';
          }
        }
      });

      applyReadMarks(reader, state);
      paintReaderProgress(reader, state, total);
    }

    function setChapterRead(read, notify) {
      var index = state.read.indexOf(chapter);
      if (read && index === -1) state.read.push(chapter);
      if (!read && index !== -1) state.read.splice(index, 1);
      state.last = chapter;
      writeState(book, state);
      refreshMarks();
      if (notify) showToast(read ? '已标记本章已读' : '已取消已读');
    }

    refreshMarks();

    markButtons.forEach(function (button) {
      button.addEventListener('click', function () {
        var isRead = state.read.indexOf(chapter) !== -1;
        suppressAuto = true;
        setChapterRead(!isRead, true);
      });
    });

    // 阅读进度条 + 自动标记
    var ticking = false;

    function updateScroll() {
      ticking = false;
      var max = root.scrollHeight - window.innerHeight;
      var top = window.pageYOffset || root.scrollTop || 0;
      var percent = max > 0 ? clamp((top / max) * 100, 0, 100) : 0;
      if (bar) bar.style.width = percent + '%';

      updateTocActive(top);

      if (!autoMarked && !suppressAuto && percent >= 92 && total > 0) {
        autoMarked = true;
        if (state.read.indexOf(chapter) === -1) {
          setChapterRead(true, true);
        }
      }
    }

    function onScroll() {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(updateScroll);
      }
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    updateScroll();

    // 章节目录筛选
    var filter = qs('[data-book-filter]', reader);
    if (filter && nav) {
      filter.addEventListener('input', function () {
        var keyword = filter.value.trim().toLowerCase();
        qsa('[data-chapter-item]', nav).forEach(function (item) {
          var matched = !keyword || item.textContent.toLowerCase().indexOf(keyword) !== -1;
          item.hidden = !matched;
        });
        qsa('.book-part-group', nav).forEach(function (group) {
          var hasVisible = qsa('[data-chapter-item]', group).some(function (item) {
            return !item.hidden;
          });
          group.hidden = !hasVisible;
        });
      });
    }

    // 当前章节在侧栏中居中
    if (nav) {
      var current = qs('.book-chapter-link.is-current', nav);
      if (current) nav.scrollTop = Math.max(0, current.offsetTop - 120);
    }

    // 本页目录高亮
    var tocLinks = qsa('.book-toc-link', reader);
    var tocMap = {};
    var headings = [];

    if (tocLinks.length && content) {
      tocLinks.forEach(function (link) {
        var href = link.getAttribute('href') || '';
        if (href.charAt(0) !== '#') return;
        var id = href.slice(1);
        try {
          id = decodeURIComponent(id);
        } catch (err) {
          /* 保持原样 */
        }
        tocMap[id] = link;
      });
      headings = qsa('.book-content h2[id], .book-content h3[id], .book-content h4[id]', reader);
    }

    function updateTocActive(scrollTop) {
      if (!tocLinks || !headings || !headings.length) return;
      var active = null;
      for (var i = 0; i < headings.length; i++) {
        var rect = headings[i].getBoundingClientRect();
        if (rect.top <= 110) active = headings[i];
        else break;
      }
      if (!active) active = headings[0];
      tocLinks.forEach(function (link) {
        link.classList.remove('is-active');
      });
      var link = tocMap[active.id];
      if (link) link.classList.add('is-active');
    }

    // 移动端侧栏
    var menuButton = qs('[data-book-menu]', reader);
    var mask = qs('[data-book-mask]', reader);

    function closeMenu() {
      reader.classList.remove('menu-open');
    }

    if (menuButton) {
      menuButton.addEventListener('click', function () {
        reader.classList.toggle('menu-open');
      });
    }
    if (mask) mask.addEventListener('click', closeMenu);
    if (nav) {
      nav.addEventListener('click', function (event) {
        if (event.target.closest('[data-chapter-link]')) closeMenu();
      });
    }

    // 回到顶部
    qsa('[data-scroll-top]', reader).forEach(function (link) {
      link.addEventListener('click', function (event) {
        event.preventDefault();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });

    // 键盘左右翻章（输入框内不触发）
    var prevUrl = reader.getAttribute('data-prev') || '';
    var nextUrl = reader.getAttribute('data-next') || '';

    doc.addEventListener('keydown', function (event) {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      var target = event.target;
      var tag = (target && target.tagName ? target.tagName : '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || (target && target.isContentEditable)) return;

      if (event.key === 'ArrowLeft' && prevUrl) window.location.href = prevUrl;
      if (event.key === 'ArrowRight' && nextUrl) window.location.href = nextUrl;
    });
  }

  /* ------------------------------------------------------------------ */
  /* 普通文章阅读进度                                                     */
  /* ------------------------------------------------------------------ */

  function initPostProgress() {
    if (qs('[data-book-reader]')) return;

    var post = qs('#post #article-container');
    if (!post) return;

    var wrap = doc.createElement('div');
    wrap.className = 'blog-reading-bar';
    var fill = doc.createElement('i');
    wrap.appendChild(fill);
    doc.body.appendChild(wrap);

    var ticking = false;

    function update() {
      ticking = false;
      var max = root.scrollHeight - window.innerHeight;
      var top = window.pageYOffset || root.scrollTop || 0;
      var percent = max > 0 ? clamp((top / max) * 100, 0, 100) : 0;
      fill.style.width = percent + '%';
    }

    window.addEventListener('scroll', function () {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(update);
      }
    }, { passive: true });

    update();
  }

  function init() {
    initShelf();
    initBookHome();
    initReader();
    initPostProgress();
  }

  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
