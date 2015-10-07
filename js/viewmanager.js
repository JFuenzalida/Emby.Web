define([], function () {

    var currentView;

    function onViewChange(view, viewId, url, isRestore) {

        var lastView = currentView;

        if (lastView) {
            lastView.dispatchEvent(new CustomEvent("viewhide", {}));
        }

        currentView = view;

        require(['bower_components/query-string/index'], function () {

            var eventDetail = getViewEventDetail(view, url, isRestore);

            if (!isRestore) {
                view.dispatchEvent(new CustomEvent("viewinit-" + viewId, eventDetail));
            }

            if (!isRestore) {
                Emby.FocusManager.autoFocus(view);
            }
            else if (view.activeElement) {
                view.activeElement.focus();
            }

            view.dispatchEvent(new CustomEvent("viewshow-" + viewId, eventDetail));
            view.dispatchEvent(new CustomEvent("viewshow", eventDetail));
        });
    }

    function getViewEventDetail(view, url, isRestore) {

        var index = url.indexOf('?');
        var params = index == -1 ? {} : queryString.parse(url.substring(index + 1));

        return {
            detail: {
                element: view,
                id: view.getAttribute('data-id'),
                params: params,
                isRestored: isRestore
            },
            bubbles: true,
            cancelable: false
        };
    }

    function resetCachedViews() {
        // Reset all cached views whenever the theme changes
        require(['viewcontainer'], function (viewcontainer) {
            viewcontainer.reset();
        });
    }

    document.addEventListener('themeunload', resetCachedViews);
    document.addEventListener('usersignedin', resetCachedViews);
    document.addEventListener('usersignedout', resetCachedViews);

    function tryRestoreInternal(viewcontainer, options, resolve, reject) {

        viewcontainer.tryRestoreView(options).then(function (view) {

            onViewChange(view, options.id, options.url, true);
            resolve();

        }, reject);
    }

    function ViewManager() {

        var self = this;

        self.loadView = function (options) {

            var lastView = currentView;

            // Record the element that has focus
            if (lastView) {
                lastView.activeElement = document.activeElement;
            }

            require(['viewcontainer'], function (viewcontainer) {
                viewcontainer.loadView(options).then(function (view) {

                    onViewChange(view, options.id, options.url);
                });
            });
        };

        self.tryRestoreView = function (options) {
            return new Promise(function (resolve, reject) {

                // Record the element that has focus
                if (currentView) {
                    currentView.activeElement = document.activeElement;
                }

                require(['viewcontainer'], function (viewcontainer) {

                    tryRestoreInternal(viewcontainer, options, resolve, reject);
                });
            });
        };
    }

    return new ViewManager();
});
