(function (globalScope) {

    function createHeaderScroller(view, initialTabId) {

        require(['slyScroller', 'loading'], function (slyScroller, loading) {

            view = view.querySelector('.userViewNames');

            var scrollFrame = view.querySelector('.scrollFrame');

            scrollFrame.style.display = 'block';

            var options = {
                horizontal: 1,
                itemNav: 'centered',
                mouseDragging: 1,
                touchDragging: 1,
                slidee: view.querySelector('.scrollSlider'),
                itemSelector: '.btnUserViewHeader',
                activateOn: 'focus',
                smart: true,
                easing: 'swing',
                releaseSwing: true,
                scrollBar: view.querySelector('.scrollbar'),
                scrollBy: 200,
                speed: 200,
                elasticBounds: 1,
                dragHandle: 1,
                dynamicHandle: 1,
                clickBar: 1
            };

            slyScroller.create(scrollFrame, options).then(function (slyFrame) {
                slyFrame.init();
                loading.hide();

                var initialTab = initialTabId ? view.querySelector('.btnUserViewHeader[data-id=\'' + initialTabId + '\']') : null;

                if (!initialTab) {
                    initialTab = view.querySelector('.btnUserViewHeader');
                }
                Emby.FocusManager.focus(initialTab);
            });
        });
    }

    function initEvents(view, instance) {

        // Catch events on the view headers
        var userViewNames = view.querySelector('.userViewNames');
        userViewNames.addEventListener('mousedown', function (e) {

            var elem = Emby.Dom.parentWithClass(e.target, 'btnUserViewHeader');

            if (elem) {
                elem.focus();
            }
        });

        userViewNames.addEventListener('focusin', function (e) {

            var elem = Emby.Dom.parentWithClass(e.target, 'btnUserViewHeader');

            if (elem) {
                instance.setFocusDelay(view, elem);
            }
        });
    }

    function selectUserView(page, id, self) {

        var btn = page.querySelector(".btnUserViewHeader[data-id='" + id + "']");

        self.bodySlyFrame.slideTo(0, true);

        self.loadViewContent.call(self, page, id, btn.getAttribute('data-type'));
    }

    function tabbedPage(page, pageOptions) {

        var self = this;
        pageOptions = pageOptions || {};
        var focusedElement;

        var selectedItemInfoInner = page.querySelector('.selectedItemInfoInner');
        var selectedIndexElement = page.querySelector('.selectedIndex');

        var tagName = Emby.Dom.supportsWebComponents() ? 'paper-button' : 'button';

        self.renderTabs = function (tabs, initialTabId) {

            page.querySelector('.viewsScrollSlider').innerHTML = tabs.map(function (i) {

                return '<' + tagName + ' class="flat btnUserViewHeader" data-id="' + i.Id + '" data-type="' + (i.CollectionType || '') + '"><h2>' + i.Name + '</h2></' + tagName + '>';

            }).join('');

            createHeaderScroller(page, initialTabId);
            initEvents(page, self);
            createHorizontalScroller(page);
        };

        var focusTimeout;
        self.setFocusDelay = function (view, elem) {

            var viewId = elem.getAttribute('data-id');

            var btn = view.querySelector('.btnUserViewHeader.selected');

            if (btn) {

                if (viewId == btn.getAttribute('data-id')) {
                    return;
                }
                btn.classList.remove('selected');
            }

            elem.classList.add('selected');

            if (focusTimeout) {
                clearTimeout(focusTimeout);
            }
            focusTimeout = setTimeout(function () {

                selectUserView(view, viewId, self);

            }, 500);
        };

        function createHorizontalScroller(view) {

            require(["slyScroller", 'loading'], function (slyScroller, loading) {

                var scrollFrame = view.querySelector('.itemScrollFrame');

                scrollFrame.style.display = 'block';

                var options = {
                    horizontal: 1,
                    itemNav: 0,
                    mouseDragging: 1,
                    touchDragging: 1,
                    slidee: view.querySelector('.contentScrollSlider'),
                    itemSelector: '.card',
                    smart: true,
                    easing: 'swing',
                    releaseSwing: true,
                    scrollBar: view.querySelector('.contentScrollbar'),
                    scrollBy: 200,
                    speed: 500,
                    elasticBounds: 1,
                    dragHandle: 1,
                    dynamicHandle: 1,
                    clickBar: 1
                };

                slyScroller.create(scrollFrame, options).then(function (slyFrame) {
                    self.bodySlyFrame = slyFrame;
                    self.bodySlyFrame.init();
                    initFocusHandler(view, self.bodySlyFrame);
                });
            });
        }

        var lastFocus = 0;
        function initFocusHandler(view) {

            if (pageOptions.handleFocus) {
                
                var scrollSlider = view.querySelector('.contentScrollSlider');

                scrollSlider.addEventListener('focusin', onFocusIn);
                scrollSlider.addEventListener('focusout', onFocusOut);
            }
        }

        function onFocusIn(e) {
            var focused = Emby.FocusManager.focusableParent(e.target);
            focusedElement = focused;

            if (focused) {

                if (selectedIndexElement) {
                    var index = focused.getAttribute('data-index');
                    if (index) {
                        selectedIndexElement.innerHTML = 1 + parseInt(index);
                    }
                }

                var now = new Date().getTime();

                var animate = pageOptions.animateFocus || (now - lastFocus) > 50;

                self.bodySlyFrame.toCenter(focused, !animate);
                lastFocus = now;
                startZoomTimer();
            }
        }

        function onFocusOut(e) {
            selectedItemInfoInner.innerHTML = '';

            var focused = focusedElement;
            focusedElement = null;

            if (focused) {
                focused.classList.remove('transformCard');
            }
        }

        var zoomTimeout;
        var selectedMediaInfoTimeout;
        function startZoomTimer() {

            if (onZoomTimeout) {
                clearTimeout(zoomTimeout);
            }
            zoomTimeout = setTimeout(onZoomTimeout, 100);
            if (selectedMediaInfoTimeout) {
                clearTimeout(selectedMediaInfoTimeout);
            }
            selectedMediaInfoTimeout = setTimeout(onSelectedMediaInfoTimeout, 900);
        }

        function onZoomTimeout() {
            var focused = focusedElement
            if (focused && document.activeElement == focused) {
                zoomIn(focused);
            }
        }

        function onSelectedMediaInfoTimeout() {
            var focused = focusedElement
            if (focused && document.activeElement == focused) {
                setSelectedItemInfo(focused);
            }
        }

        function zoomIn(elem) {

            if (elem.classList.contains('noScale')) {
                return;
            }

            var card = elem;

            if (document.activeElement == card) {
                card.classList.add('transformCard');
            }
        }

        function setSelectedItemInfo(card) {

            var id = card.getAttribute('data-id');

            if (!id) {
                return;
            }

            Emby.Models.item(id).then(function (item) {
                Emby.Backdrop.setBackdrops([item]);
                setSelectedInfo(card, item);
            });
        }

        function setSelectedInfo(card, item) {

            var html = '';

            html += '<div>';
            html += item.Name;
            html += '</div>';

            if (item.AlbumArtist) {
                html += '<div class="selectedItemSecondaryInfo">';
                html += item.AlbumArtist;
                html += '</div>';
            }

            var mediaInfo = DefaultTheme.CardBuilder.getMediaInfoHtml(item);

            if (mediaInfo) {
                html += '<div class="selectedItemSecondaryInfo">';
                html += mediaInfo;
                html += '</div>';
            }

            var logoImageUrl = Emby.Models.logoImageUrl(item, {
            });

            if (logoImageUrl) {
                selectedItemInfoInner.classList.add('selectedItemInfoInnerWithLogo');

                html += '<div class="selectedItemInfoLogo" style="background-image:url(\'' + logoImageUrl + '\');"></div>';

            } else {
                selectedItemInfoInner.classList.remove('selectedItemInfoInnerWithLogo');
            }

            selectedItemInfoInner.innerHTML = html;

            if (html) {
                fadeIn(selectedItemInfoInner, 1);
            }
        }

        function fadeIn(elem, iterations) {
            var keyframes = [
              { opacity: '0', offset: 0 },
              { opacity: '1', offset: 1 }];
            var timing = { duration: 300, iterations: iterations };
            return elem.animate(keyframes, timing);
        }

        self.destroy = function () {
            if (self.bodySlyFrame) {
                self.bodySlyFrame.destroy();
                self.bodySlyFrame = null
            }
        };
    }

    if (!globalScope.DefaultTheme) {
        globalScope.DefaultTheme = {};
    }

    globalScope.DefaultTheme.TabbedPage = tabbedPage;

})(this);