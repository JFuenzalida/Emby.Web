define([], function () {

    return function () {

        var self = this;

        self.name = 'Backdrop ScreenSaver';
        self.type = 'screensaver';
        self.packageName = 'backdropscreensaver';
        self.supportsAnonymous = false;

        var currentSlideshow;

        self.show = function () {

            var query = {
                ImageTypes: "Backdrop",
                EnableImageTypes: "Backdrop",
                IncludeItemTypes: "Movie,Series,MusicArtist,Game",
                SortBy: "Random",
                Recursive: true,
                Fields: "Taglines",
                ImageTypeLimit: 1,
                StartIndex: 0,
                Limit: 200
            };

            Emby.Models.items(query).then(function (result) {

                if (result.Items.length) {

                    require(['slideshow'], function (slideshow) {

                        var newSlideShow = new slideshow({
                            showTitle: true,
                            cover: true,
                            items: result.Items
                        });

                        newSlideShow.show();
                        currentSlideshow = newSlideShow;
                    });
                }
            });
        };

        self.hide = function () {

            if (currentSlideshow) {
                currentSlideshow.hide();
                currentSlideshow = null;
            }
        };
    }
});