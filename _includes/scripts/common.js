(function () {
  var $body = document.body;
  function classnames(classes) {
    var i, cur, _classes = '';
    if (window.isString(classes)) {
      _classes =  classes;
    } else if (window.isArray(classes)) {
      for (i = 0; i < classes.length; i++) {
        cur = classes[i];
        if (window.isString(cur)) {
          _classes = _classes.concat(_classes ? ' ' + cur : cur);
        }
      }
    } else {
      return '';
    }
    return _classes;
  }
  function addClass(dom, classname) {
    dom.setAttribute('class', classnames([dom.getAttribute('class'), classname]));
  }
  if (window.hasEvent('touchstart')) {
    addClass($body, 'is-touch');
    document.addEventListener('touchstart', function(){}, false);
  } else {
    addClass($body, 'not-touch');
  }
})();