const { entrypoints } = require('uxp');

entrypoints.setup({
    panels: {
        'xuanshang-canvas': {
            create() {
                const root = document.getElementById('root');
                globalThis.sdppp.renderPhotoshopPlugin(root);
                return root;
            },
        },
    },
});
