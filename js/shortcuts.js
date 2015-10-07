(function (globalScope) {

    // Add some shortcuts
    document.addEventListener('click', function (e) {

        var card = Emby.Dom.parentWithClass(e.target, 'itemAction');

        if (card) {
            var action = card.getAttribute('data-action');

            if (action) {

                var id = card.getAttribute('data-id');
                var type = card.getAttribute('data-type');
                var isfolder = card.getAttribute('data-isfolder') == 'true';

                if (action == 'link') {
                    Emby.Page.showItem({
                        Id: id,
                        Type: type,
                        IsFolder: isfolder
                    });
                }

                else if (action == 'instantmix') {
                    Emby.PlaybackManager.instantMix(id);
                }
            }
        }
    });

})(this);
