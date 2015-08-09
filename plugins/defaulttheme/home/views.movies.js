(function (globalScope) {

    function loadResume(element, parentId) {

        var options = {

            Limit: 6,
            ParentId: parentId,
            ImageTypeLimit: 1,
            EnableImageTypes: "Primary,Backdrop,Thumb"
        };

        Emby.Models.resumable(options).then(function (result) {

            var resumeSection = element.querySelector('.resumeSection');

            DefaultTheme.CardBuilder.buildCards(result.Items, {
                parentContainer: resumeSection,
                itemsContainer: resumeSection.querySelector('.itemsContainer'),
                shape: 'backdropCard homebackdropCard',
                rows: 3,
                width: DefaultTheme.CardBuilder.homeThumbWidth,
                preferThumb: true
            });
        });
    }

    function loadLatest(element, parentId) {

        var options = {

            IncludeItemTypes: "Movie",
            Limit: 12,
            ParentId: parentId,
            EnableImageTypes: "Primary,Backdrop,Thumb"
        };

        Emby.Models.latestItems(options).then(function (result) {

            var resumeSection = element.querySelector('.latestSection');

            DefaultTheme.CardBuilder.buildCards(result, {
                parentContainer: resumeSection,
                itemsContainer: resumeSection.querySelector('.itemsContainer'),
                shape: 'portraitCard homePortraitCard',
                rows: 2,
                width: DefaultTheme.CardBuilder.homePortraitWidth
            });
        });
    }

    function loadSpotlight(element, parentId) {

        var options = {

            SortBy: "Random",
            IncludeItemTypes: "Movie",
            Limit: 20,
            Recursive: true,
            ParentId: parentId,
            EnableImageTypes: "Backdrop",
            ImageTypes: "Backdrop",
            Fields: "Taglines"
        };

        Emby.Models.items(options).then(function (result) {

            var card = element.querySelector('.homebackdropSpotlightCard');

            require([Emby.PluginManager.mapRequire('defaulttheme', 'home/spotlight.js')], function () {

                new DefaultTheme.spotlight(card, result.Items, DefaultTheme.CardBuilder.homeThumbWidth * 2);
            });
        });
    }

    function loadRecommendations(element, parentId) {

        Emby.Models.movieRecommendations({

            categoryLimit: 4,
            ItemLimit: 8

        }).then(function (recommendations) {

            var recs = element.querySelector('.recommendations');

            Promise.all(recommendations.map(getRecommendationHtml)).then(function(values) {
                
                recs.innerHTML = values.join('');
                Emby.ImageLoader.lazyChildren(recs);
            });
        });
    }

    function getRecommendationHtml(recommendation) {

        return new Promise(function (resolve, reject) {

            DefaultTheme.CardBuilder.buildCardsHtml(recommendation.Items, {
                shape: 'portraitCard homePortraitCard',
                rows: 2,
                width: DefaultTheme.CardBuilder.homePortraitWidth
            }).then(function (cardsHtml) {

                var html = '';

                var title = '';

                switch (recommendation.RecommendationType) {

                    case 'SimilarToRecentlyPlayed':
                        title = Globalize.translate('RecommendationBecauseYouWatched').replace("{0}", recommendation.BaselineItemName);
                        break;
                    case 'SimilarToLikedItem':
                        title = Globalize.translate('RecommendationBecauseYouLike').replace("{0}", recommendation.BaselineItemName);
                        break;
                    case 'HasDirectorFromRecentlyPlayed':
                    case 'HasLikedDirector':
                        title = Globalize.translate('RecommendationDirectedBy').replace("{0}", recommendation.BaselineItemName);
                        break;
                    case 'HasActorFromRecentlyPlayed':
                    case 'HasLikedActor':
                        title = Globalize.translate('RecommendationStarring').replace("{0}", recommendation.BaselineItemName);
                        break;
                }

                html += '<div class="homeSection">';
                html += '<div class="sectionTitle">' + title + '</div>';

                html += '<div class="itemsContainer">';

                html += cardsHtml;

                html += '</div>';
                html += '</div>';

                resolve(html);
            });
        });
    }

    function view(element, parentId) {

        var self = this;

        loadResume(element, parentId);
        loadLatest(element, parentId);
        loadSpotlight(element, parentId);
        loadRecommendations(element, parentId);

        self.destroy = function () {

        };
    }

    if (!globalScope.DefaultTheme) {
        globalScope.DefaultTheme = {};
    }

    globalScope.DefaultTheme.moviesView = view;

})(this);