(function() {
  var SOURCES = window.TEXT_VARIABLES.sources;
  function queryString() {
    // This function is anonymous, is executed immediately and
    // the return value is assigned to QueryString!
    var i = 0, queryObj = {}, pair;
    var queryStr = window.location.search.substring(1);
    var queryArr = queryStr.split('&');
    for (i = 0; i < queryArr.length; i++) {
      pair = queryArr[i].split('=');
      // If first entry with this name
      if (typeof queryObj[pair[0]] === 'undefined') {
        queryObj[pair[0]] = pair[1];
        // If second entry with this name
      } else if (typeof queryObj[pair[0]] === 'string') {
        queryObj[pair[0]] = [queryObj[pair[0]], pair[1]];
        // If third or later entry with this name
      } else {
        queryObj[pair[0]].push(pair[1]);
      }
    }
    return queryObj;
  }

  function memorize(f) {
    var cache = {};
    return function () {
      var key = Array.prototype.join.call(arguments, ',');
      if (key in cache) return cache[key];
      else return cache[key] = f.apply(this, arguments);
    };
  }

  function initData(json) {
    var _data = JSON.parse(json), i, j, cur, _tags;
    Object.keys(_data).forEach(function(year) {
      for (i = 0; i < _data[year].length; i++) {
        cur = _data[year][i], _tags = cur.tags;
        cur.title = window.decodeUrl(cur.title);
        cur.url = window.decodeUrl(cur.url);
        if (_tags && _tags.length > 0) {
          for (j = 0; j < _tags.length; j++) {
            _tags[j] = window.decodeUrl(_tags[j]);
          }
        }
      }
    });
    return _data;
  }

  var setUrlQuery = (function() {
    var baseUrl =  window.location.href.split('?')[0];
    return function(query) {
      if (typeof query === 'string') {
        window.history.replaceState(null, '', baseUrl + query);
      } else {
        window.history.replaceState(null, '', baseUrl);
      }
    };
  })();

  var data = initData('{%- include scripts/article-list.html -%}');

  var searchByTag = memorize(function(tag) {
    var i, j, cur, _tags, _tag, _data = {};
    Object.keys(data).forEach(function(year) {
      for (i = 0; i < data[year].length; i++) {
        cur = data[year][i], _tags = cur.tags;
        if (_tags && _tags.length > 0) {
          for (j = 0; j < _tags.length; j++) {
            _tag = _tags[j];
            if (_tag === tag) {
              if (!_data[year]) {
                _data[year] = [];
              }
              _data[year].push(cur);
              break;
            }
          }
        }
      }
    });
    return _data;
  });

  var searchByQuery = function(query) {
    var i, cur, _title, _data = { _: [] };
    Object.keys(data).forEach(function(year) {
      for (i = 0; i < data[year].length; i++) {
        cur = data[year][i], _title = cur.title;
        if (_title.toLowerCase().indexOf(query.toLowerCase()) >= 0) {
          _data._.push(cur);
        }
      }
    });
    return _data;
  };

  window.Lazyload.js(SOURCES.jquery, function() {
    var $root = $('.js-all');
    var $searchBox = $('.js-search-box');
    var $searchInput = $searchBox.children('input');
    var $searchClear = $searchBox.children('.icon-clear');
    var $tags = $('.js-tags');
    var $articleTags = $('.js-article-tag');
    var $tagShowAll = $('.js-tag-show-all');
    var $result = $('.js-result');
    var $lastFocusButton = null;

    function addClass(dom, className) {
      dom.hasClass(className) || dom.addClass(className);
    }
    function removeClass(dom, className) {
      dom.hasClass(className) && dom.removeClass(className);
    }

    var renderHeading = memorize(function (year) {
      return $('<h2 class="year">' + year + '</h2>');
    });
    var renderItem = memorize(function (key, title, date, url) {
      return $('<li><span class="date">' + date + '</span><a class="link" href="' + url + '">' + title + '</a></li>');
    });
    function render(data) {
      var $dom = $('<div></div>'), $section, $ul, i, cur;
      Object.keys(data).sort(function(a, b) {
        return b.localeCompare(a);
      }).forEach(function(year) {
        $section = $('<section></section>'), $ul = $('<ul></ul>');
        (year === '_') || $section.append(renderHeading(year));
        for (i = 0; i < data[year].length; i++) {
          cur = data[year][i];
          $ul.append(renderItem(cur.key, cur.title, cur.date, cur.url, cur.tags));
        }
        $dom.append($section.append($ul));
      });
      return $dom;
    }

    function searchButtonsByTag(_tag/*raw tag*/) {
      if (!_tag) {
        return $tagShowAll;
      }
      var _buttons = $articleTags.filter('[data-encode="' + _tag + '"]');
      if (_buttons.length === 0) {
        return $tagShowAll;
      }
      return _buttons;
    }
    function buttonFoucs(target) {
      if (target) {
        addClass(target, 'focus');
        $lastFocusButton && !$lastFocusButton.is(target) && removeClass($lastFocusButton, 'focus');
        $lastFocusButton = target;
      }
    }

    function setIsSearch() {
      addClass($root, 'search');
    }
    function setNotSearch() {
      removeClass($root, 'search');
    }
    function setIsEmpty() {
      removeClass($searchBox, 'not-empty');
    }
    function setNotEmpty() {
      addClass($searchBox, 'not-empty');
    }
    function setSearchBoxVal(val) {
      ($searchInput.val() === val) || $searchInput.val(val);
    }
    function clearSearchBox() {
      setSearchBoxVal(''); queryInput('');
    }

    function showAll() {
      setNotSearch(); setIsEmpty(); buttonFoucs($tagShowAll); setUrlQuery();
      $result.html(render(data));
    }
    function tagSelect(tag/*decode tag*/, target) {
      var _tag;
      if (tag === '' || tag === undefined) {
        showAll();
      } else {
        $result.html(render(searchByTag(tag)));
      }
      if (target) {
        buttonFoucs(target);
        _tag = target.attr('data-encode');
        if (_tag === '' || typeof _tag !== 'string') {
          setUrlQuery();
        } else {
          setUrlQuery('?tag=' + _tag);
        }
      }
    }
    function queryInput(query) {
      if (query === '' || typeof query !== 'string') {
        showAll();
      } else {
        $result.html(render(searchByQuery(query))); setIsSearch(); setNotEmpty(); setUrlQuery('?q=' + query);

      }
    }

    (function() {
      $articleTags.removeClass('inactive');
      var query = queryString(), _tag = query.tag, _q = query.q;
      if (_tag !== undefined) {
        query.tag === undefined || (_tag = query.tag);
        tagSelect(window.decodeUrl(_tag));
        buttonFoucs(searchButtonsByTag(_tag));
      } else if (_q !== undefined) {
        _q = window.decodeUrl(_q);
        queryInput(_q); setSearchBoxVal(_q);
      } else {
        showAll();
      }
    })();

    $tags.on('click', 'button', function() {
      tagSelect($(this).children('span').text(), $(this));
    });

    $searchInput.on('input', window.throttle(function() {
      queryInput($(this).val());
    }, 400));
    $searchInput.on('focus', function() {
      addClass($(this), 'focus');
    });
    $searchInput.on('blur', function() {
      removeClass($(this), 'focus');
    });
    $searchClear.on('click', function() {
      clearSearchBox();
    });
  });
})();
