FROM iojs

COPY app.js /site/app.js
COPY config.js /site/config.js

COPY node_modules /site/node_modules
COPY public/ /site/public
COPY views/ /site/views

WORKDIR /site

EXPOSE 80

CMD ["iojs", "app"]