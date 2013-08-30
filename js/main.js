var LocalStorage = (function() {
  var prefix = "rss-reader",
      supported = false;

  supported = (window.hasOwnProperty("localStorage") || 'localStorage' in window);

  var generateKey = function(key) {
    return prefix + "." + key;
  };

  var add = function(key, value) {
    if (!supported) { return false; }
    return localStorage.setItem(generateKey(key), JSON.stringify(value));
  };

  var remove = function(key) {
    if (!supported) { return false; }
    return localStorage.removeItem(generateKey(key));
  };

  var get = function(key) {
    if (!supported) { return false; }
    try {
      return JSON.parse(localStorage.getItem(generateKey(key)));
    } catch (e) {
      return null;
    }
  };

  var clearAll = function() {
    if (!supported) { return false; }
    for (var key in localStorage) {
      if (key.substring(0, prefix.length) === prefix) {
          remove(key.substring(prefix.length + 1));
      }
    }
    return true;
  };

  return {
    add: add,
    set: add,
    remove: remove,
    get: get,
    clearAll: clearAll
  };
})();

var Utilities = (function() {
  var changeFavicon = function(number) {
    var canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    var ctx = canvas.getContext('2d');
    var img = new Image();
    img.src = 'favicon.ico';
    img.onload = function() {
        ctx.drawImage(img, 0, 0);
        if (number !== null) {
          ctx.fillStyle = "#000";
          ctx.fillRect(0, 0, 32, 32);
          ctx.fillStyle = '#FFFFFF';
          var font = {
            size: 24,
            x: 3,
            y: 25
          };
          if (number > 99) {
            font.size = 18;
            font.x = 1;
            font.y = 23;
          } else if (number < 10) {
            font.size = 28;
            font.x = 8;
          }
          ctx.font = 'bold ' + font.size + 'px sans-serif';
          ctx.fillText(number, font.x, font.y, 32);
        }

        var link = document.getElementById('favicon');
        link.href = canvas.toDataURL("image/x-icon");
    };
  };
  return {
    changeFavicon: changeFavicon
  };
})();

var FeedController = function($scope, $rootScope) {
  $scope.list = [];
  $scope.selected = null;
  var current = null;

  $scope.read = function(item) {
    $rootScope.$broadcast("change-item", item, $scope.list, current);
    $scope.selected = item;
  };

  $rootScope.$on("change-feed", function(event, id) {
    current = id;
    $scope.selected = null;
    $scope.list = LocalStorage.get("items-" + id);
  });

  $rootScope.$on("update-unread-count", function(event, id, count, just_update) {
    if (typeof just_update == "undefined") {
      LocalStorage.set('items-' + id, $scope.list);
    } else {
      if (current == id) {
        // $scope.list = LocalStorage.get('items-' + id);
      }
    }
  });

  $rootScope.$on("refresh", function(event) {
    $scope.list = LocalStorage.get('items-' + current);
    $scope.$apply();
  });
};

var FeedListController = function($scope, $rootScope) {
  $scope.list = LocalStorage.get('feedlist');
  $scope.new  = "";
  $scope.feedRemaining = 0;
  $scope.lastUpdate = "Never";

  $scope.selected = null;

  $rootScope.$on("update-unread-count", function(event, id, count) {
    for(var i in $scope.list) {
      if ($scope.list.hasOwnProperty(i) && $scope.list[i].hasOwnProperty('id') && $scope.list[i].id == id) {
        $scope.list[i].unread = count;
      }
      LocalStorage.set('feedlist', $scope.list);
    }
    updateSumUnread();
    return true;
  });

  var updateSumUnread = function() {
    var unread = 0;
    for(var i in $scope.list) {
      unread += $scope.list[i].unread;
    }
    if (unread < 1) {
      unread = null;
    }
    return Utilities.changeFavicon(unread);
  };

  $rootScope.$on("save", function(event) {
    LocalStorage.set('feedlist', $scope.list);
    $scope.list = LocalStorage.get('feedlist');
    $scope.$apply();
    updateSumUnread();
    return true;
  });

  $rootScope.$on("refresh", function(event) {
    updateSumUnread();
    $scope.list = LocalStorage.get('feedlist');
    $scope.$apply();
    updateSumUnread();
  });

  $scope.selectFeed = function(item) {
    $scope.selected = item;
    $rootScope.$broadcast("change-feed", item.id);
  };

  $scope.add = function() {
    $scope.new = $scope.new.trim();
    if ($scope.new === "") {
      alert("Empty URL. If you do not want to add a new address, please do not press the Add button");
      return false;
    }
    var feed = new google.feeds.Feed($scope.new);
    feed.setResultFormat(google.feeds.Feed.JSON_FORMAT);
    feed.setNumEntries(20);
    feed.load(function(resp) {
      if (resp.hasOwnProperty('error')) {
        return alert(resp.error.message);
      }
      resp = resp.feed;
      var item = {
        id: resp.feedUrl,
        name: resp.title,
        unread: resp.entries.length
      };
      $scope.list.push(item);
      var items = [];
      for(var i in resp.entries) {
        var entry = resp.entries[i];
        entry.unread = true;
        items.push(entry);
      }
      LocalStorage.add("items-" + resp.feedUrl, items);
      $rootScope.$broadcast("save");
    });
    $scope.new = "";
  };

  $scope.update = function() {
    var updateFeed = function(response) {
      response = response.feed;
      var items = LocalStorage.get('items-' + response.feedUrl);
      for(var i = response.entries.length - 1; i >= 0; i--) {
        var found = false;
        for(var j in items) {
          if (response.entries[i].link == items[j].link) {
            found = true;
            break;
          }
        }
        if (found === false) {
          response.entries[i].unread = true;
          items.unshift(response.entries[i]);
          // console.log(response.entries[i].title + " pushed.");
        }
      }
      var unread_count = (items.filter(function(v) {
        return v.unread;
      })).length;
      LocalStorage.set('items-' + response.feedUrl, items);
      $rootScope.$broadcast("update-unread-count", response.feedUrl, unread_count, true);

      $scope.feedRemaining--;

      if ($scope.feedRemaining < 1) {
        $scope.feedRemaining = 0;
        $rootScope.$broadcast("refresh");
      }
    };

    for(var i = 0, _l = $scope.list.length; i < _l; i++) {
      $scope.feedRemaining++;
      var feed = new google.feeds.Feed($scope.list[i].id);
      feed.setResultFormat(google.feeds.Feed.JSON_FORMAT);
      feed.setNumEntries(20);
      feed.load(updateFeed);
    }
    $scope.lastUpdate = new Date();
  };

  setInterval($scope.update, 1000*60*5);
  updateSumUnread();
};

var ContentController = function($scope, $rootScope) {
  var defaults = {
    title: "",
    content: "",
    link: "http://yitsushi.github.com/SimpleAngularRss/"
  };
  $scope.item = defaults;

  $rootScope.$on("change-item", function(event, item, list, list_id) {
    $scope.item = item;
    item.unread = false;
    var unread_count = (list.filter(function(v) {
      return v.unread;
    })).length;
    for(list = document.getElementsByTagName("a"), i = 0; i < list.length; i++) {
      list[i].target = "_blank";
    }
    $rootScope.$broadcast("update-unread-count", list_id, unread_count);
  });

  $rootScope.$on("change-feed", function(event, id) {
    $scope.item = defaults;
  });
};

var HeaderController = function($scope, $rootScope) {
  var defaults = {
    title: "Simple Angular.js RSS Reader",
    contentSnippet: "This is a simple RSS reader with Angular.js. Just a simple file and some makeup. :)"
  };
  $scope.item = defaults;

  $rootScope.$on("change-item", function(event, item, list, list_id) {
    $scope.item = item;
    item.unread = false;
    var unread_count = (list.filter(function(v) {
      return v.unread;
    })).length;
    $rootScope.$broadcast("update-unread-count", list_id, unread_count);

    var options = {
      contenturl: item.link,
      clientid: '58160081473.apps.googleusercontent.com',
      cookiepolicy: 'single_host_origin',
      prefilltext: "I read this article with SimpleAngularRss. It's awesome :)\n\n+117585353655713812382",
      calltoactionlabel: 'READ_MORE',
      calltoactionurl: item.link
    };
    gapi.interactivepost.render('_share-gplus', options);
    gapi.interactivepost.render('_share-gplus', options);
  });

  $rootScope.$on("change-feed", function(event, id) {
    $scope.item = defaults;
  });
};

var initializeApp = function() {
    google.load("feeds", "1");
    if (LocalStorage.get('feedlist')) {
        return false;
    }
    LocalStorage.clearAll();

    LocalStorage.add('feedlist', []);
};
initializeApp();