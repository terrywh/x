NODE_PREFIX?=/data/vendor/node-12.3.1
# rollup uglify-es

all: x.min.js x.min.map

x.min.map: x.js
x.min.js: x.js
	${NODE_PREFIX}/bin/node ${NODE_PREFIX}/bin/uglifyjs --compress --mangle  --comments "/^!/" -o x.min.js --source-map -- x.js
x.js: src/binding.js src/component.js src/observable.js src/x.js
	${NODE_PREFIX}/bin/node ${NODE_PREFIX}/bin/rollup --banner "/*! x.js v1.0.1 / (c) TerryWu / MIT */" -f esm -o x.js src/x.js
