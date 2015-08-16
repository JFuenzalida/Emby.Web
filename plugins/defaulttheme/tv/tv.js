(function () {

    document.addEventListener("viewinit-defaulttheme-tv", function (e) {

        new tvPage(e.detail.element, e.detail.params);
    });

    function tvPage(view, params) {

        var self = this;
        var itemPromise;

        view.addEventListener('viewshow', function (e) {

            require(['loading'], function (loading) {

                if (!self.tabbedPage) {
                    loading.show();
                    renderTabs(view, params.tab, self, params);
                }

                itemPromise = itemPromise || Emby.Models.item(params.parentid);

                itemPromise.then(function (item) {

                    Emby.Page.setTitle(item.Name);
                    Emby.Backdrop.setBackdrops([item]);
                });
            });
        });

        view.addEventListener('viewdestroy', function () {

            if (self.tabbedPage) {
                self.tabbedPage.destroy();
            }
        });
    }

    function renderTabs(view, initialTabId, pageInstance, params) {

        var tabs = [
        {
            Name: Globalize.translate('Suggested'),
            Id: "suggested"
        },
        {
            Name: Globalize.translate('Latest'),
            Id: "latest"
        },
        {
            Name: Globalize.translate('Series'),
            Id: "series"
        },
        {
            Name: Globalize.translate('Upcoming'),
            Id: "upcoming"
        },
        {
            Name: Globalize.translate('Genres'),
            Id: "genres"
        }];

        var tabbedPage = new DefaultTheme.TabbedPage(view);
        tabbedPage.loadViewContent = loadViewContent;
        tabbedPage.params = params;
        tabbedPage.renderTabs(tabs, initialTabId);
        pageInstance.tabbedPage = tabbedPage;
    }

    function loadViewContent(page, id, type) {

        var pageParams = this.params;

        var autoFocus = false;

        if (!this.hasLoaded) {
            autoFocus = true;
            this.hasLoaded = true;
        }

        switch (id) {

            case 'series':
                renderSeries(page, pageParams, autoFocus);
                break;
            case 'latest':
                renderLatest(page, pageParams, autoFocus);
                break;
            case 'genres':
                renderGenres(page, pageParams, autoFocus);
                break;
            default:
                break;
        }
    }

    function renderLatest(page, pageParams, autoFocus) {

        self.tabController = new DefaultTheme.HorizontalList({

            itemsContainer: page.querySelector('.contentScrollSlider'),
            getItemsMethod: function (startIndex, limit) {
                return Emby.Models.latestItems({
                    IncludeItemTypes: "Episode",
                    ImageTypeLimit: 1,
                    EnableImageTypes: "Primary,Backdrop,Thumb",
                    StartIndex: startIndex,
                    Limit: Math.min(limit, 32),
                    ParentId: pageParams.parentid,
                    Recursive: true,
                    SortBy: "SortName"
                });
            },
            listCountElement: page.querySelector('.listCount'),
            listNumbersElement: page.querySelector('.listNumbers'),
            autoFocus: autoFocus,
            cardOptions: {
                shape: 'backdropCard',
                rows: 3,
                preferThumb: true,
                width: DefaultTheme.CardBuilder.homeThumbWidth
            }
        });

        self.tabController.render();
    }

    function renderSeries(page, pageParams, autoFocus) {

        self.tabController = new DefaultTheme.HorizontalList({

            itemsContainer: page.querySelector('.contentScrollSlider'),
            getItemsMethod: function (startIndex, limit) {
                return Emby.Models.items({
                    StartIndex: startIndex,
                    Limit: limit,
                    ParentId: pageParams.parentid,
                    IncludeItemTypes: "Series",
                    Recursive: true,
                    SortBy: "SortName"
                });
            },
            listCountElement: page.querySelector('.listCount'),
            listNumbersElement: page.querySelector('.listNumbers'),
            autoFocus: autoFocus
        });

        self.tabController.render();
    }

    function renderGenres(page, pageParams, autoFocus) {

        self.tabController = new DefaultTheme.HorizontalList({
            itemsContainer: page.querySelector('.contentScrollSlider'),
            getItemsMethod: function (startIndex, limit) {
                return Emby.Models.genres({
                    StartIndex: startIndex,
                    Limit: limit,
                    ParentId: pageParams.parentid,
                    SortBy: "SortName"
                });
            },
            listCountElement: page.querySelector('.listCount'),
            listNumbersElement: page.querySelector('.listNumbers'),
            autoFocus: autoFocus
        });

        self.tabController.render();
    }

})();