/* @ngInject */
function transformEmbedded(authentication, embedded, $state) {
    const EMBEDDED_CLASSNAME = 'proton-embedded';
    const wrapImage = (img) => angular.element(img).wrap('<div class="image loading"></div>');

    return (html, message, { action }) => {
        const images = [].slice.call(html.querySelectorAll('img[proton-src]'));
        const user = authentication.user || { ShowEmbedded: 0 };
        const show = message.showEmbedded === true || user.ShowEmbedded === 1;
        const isEoReply = $state.is('eo.reply');

        images.forEach((image) => {
            const src = image.getAttribute('proton-src');
            image.setAttribute('referrerPolicy', 'no-referrer');
            const attachment = embedded.getAttachment(message, src);

            if (!image.classList.contains(EMBEDDED_CLASSNAME)) {
                image.classList.add(EMBEDDED_CLASSNAME);
            }

            // check if the attachment exist before processing
            if (!(attachment && Object.keys(attachment).length > 0)) {
                return;
            }

            if (show) {
                image.setAttribute('data-embedded-img', src);

                // Auto load image inside a reply draft
                if (/^reply|forward/.test(action)) {
                    const url = embedded.getUrl(image);
                    image.src = url;
                    return;
                }

                // We don't need to add it outside
                if (!isEoReply) {
                    !image.parentElement.classList.contains('loading') && wrapImage(image);
                    image.removeAttribute('src');
                }
                return;
            }

            message.showEmbedded = false;
            image.setAttribute('alt', attachment.Name);
        });

        return html;
    };
}
export default transformEmbedded;
