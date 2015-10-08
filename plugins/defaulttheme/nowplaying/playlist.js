(function () {

    document.addEventListener("viewinit-defaulttheme-nowplayingplaylist", function (e) {

        new playlistPage(e.detail.element, e.detail.params);
    });

    function playlistPage(view, params) {

        var self = this;

        function setCurrentItem(item) {

            if (item) {
                Emby.Backdrop.setBackdrops([item]);

            } else {
                Emby.Backdrop.clear();
            }
        }

        function onPlaybackStart(e, player) {

            setCurrentItem(Emby.PlaybackManager.currentItem());
        }

        function onPlaybackStop(e, player) {
            setCurrentItem(null);
        }

        function renderPlaylist() {

            var section = view.querySelector('.trackList');

            var items = Emby.PlaybackManager.playlist();

            section.innerHTML = DefaultTheme.CardBuilder.getListViewHtml(items, {
                action: 'setplaylistindex'
            });

            Emby.ImageLoader.lazyChildren(section);
        }

        view.addEventListener('viewshow', function (e) {

            var isRestored = e.detail.isRestored;

            Emby.Page.setTitle(Globalize.translate('NowPlaying'));

            Events.on(Emby.PlaybackManager, 'playbackstart', onPlaybackStart);
            Events.on(Emby.PlaybackManager, 'playbackstop', onPlaybackStop);

            renderPlaylist();

            onPlaybackStart(e, Emby.PlaybackManager.currentPlayer());

            if (!isRestored) {
                createVerticalScroller(view, self);
            }
        });

        view.addEventListener('viewhide', function () {

            Events.off(Emby.PlaybackManager, 'playbackstart', onPlaybackStart);
            Events.off(Emby.PlaybackManager, 'playbackstop', onPlaybackStop);

        });

        view.addEventListener('viewdestroy', function () {

            if (self.slyFrame) {
                self.slyFrame.destroy();
            }
        });
    }

    function createVerticalScroller(view, pageInstance) {

        require(["slyScroller", 'loading'], function (slyScroller, loading) {

            var scrollFrame = view.querySelector('.scrollFrame');

            var options = {
                horizontal: 0,
                itemNav: 0,
                mouseDragging: 1,
                touchDragging: 1,
                slidee: view.querySelector('.scrollSlider'),
                itemSelector: '.card',
                smart: true,
                easing: 'easeOutQuart',
                releaseSwing: true,
                scrollBar: view.querySelector('.scrollbar'),
                scrollBy: 200,
                speed: 300,
                dragHandle: 1,
                dynamicHandle: 1,
                clickBar: 1
            };

            slyScroller.create(scrollFrame, options).then(function (slyFrame) {
                pageInstance.slyFrame = slyFrame;
                slyFrame.init();
                initFocusHandler(view, slyFrame);
            });
        });
    }

    function initFocusHandler(view, slyFrame) {

        var scrollSlider = view.querySelector('.scrollSlider');
        scrollSlider.addEventListener('focusin', function (e) {

            var focused = Emby.FocusManager.focusableParent(e.target);

            if (focused) {
                slyFrame.toCenter(focused);
            }
        });
    }

})();