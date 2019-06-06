/* x.js @author terry.wuhao@gmail.com */
(function(exports) {
    const
        $bound = Symbol("$bound")
        $trigger = Symbol("$trigger")
        $key   = Symbol("$key"),
        $val   = Symbol("$val");

    let VALUE = function(x, key, val) { // 属性访问
            key = key.split(".");
            let ctr = x;
            for(let i=0;i<key.length-1;++i) {
                ctr = ctr[key[i]];
            }
            key = key.pop();
            if(val !== undefined) ctr[key] = val;
            val = ctr ? ctr[key] : undefined;
            return val instanceof Y ? val[$val].call(x) : val;
        },
        BIND = function(x, key, cb, el) {
            let b = x[$bound][key];
            if(!b) x[$bound][key] = b = [];
            cb[$trigger] = el;
            b.push(cb);
        },
        Y = function Z(key, val) {
            // if(!new.target) return new Z(key, cb);
            this[$key] = Array.isArray(key) ? key : [key];
            this[$val] = val;
        },
        WATCH = function(x, y, prefix, data) { // 数据监听
            function notify(val, key, old) {
                let cbs = x[$bound][key]; // $bound 平级结构监听
                if(cbs) for(let cb of cbs) {
                    if(x[$trigger] !== cb[$trigger]) // 不调用触发来源
                        cb.call(x, val, key, old);
                }
            }
            for(let name in data) {
                let child = data[name];
                if(child instanceof Y) {
                    for(let key of child[$key]) {
                        BIND(x, key, function(val, key, old) {
                            notify(child[$val].call(x), prefix + name);
                        }, null);
                    }
                    Object.defineProperty(y, name, {
                        get: function() {
                            return child[$val].call(x);
                        },
                    });
                }else{
                    Object.defineProperty(y, name, {
                        get: function() {
                            return data[name];
                        },
                        set: function(val) {
                            let old = data[name];
                            data[name] = val;
                            notify(val, prefix + name, old);
                        }
                    });

                    if(typeof(child) === "object") {
                        WATCH(x, data[name] = {}, prefix + name + ".", child);
                    }
                }
            }
        },
        FN = { // 功能标签
            "x-i18n": function(x, el, attr, key) {
                if(x.$i18n instanceof Function) return x.$i18n.call(x, key, function(val) {
                    attr ? el.setAttribute(attr, val) : el.innerHTML = val;
                });
                let val = x.$i18n[key];
                if(val) attr ? el.setAttribute(key, val) : el.innerHTML = val;
            },
            "x-text": function(x, el, attr, key) {
                el.innerText = VALUE(x, key);
                BIND(x, key, function(val) {
                    el.innerText = val;
                }, null);
            },
            "x-html": function(x, el, attr, key) {
                el.innerHTML = VALUE(x, key);
                BIND(x, key, function(val) {
                    el.innerHTML = val;
                }, null);
            },
            "x-prop": function(x, el, attr, key) {
                // key[0] == "'"
                function v2c(val) {
                    if(val) val === true ? el.setAttribute(attr, true) : el.setAttribute(attr, val);
                    else if(val === false) el.removeAttribute(attr);
                    else el.setAttribute(attr, val);
                }
                v2c(VALUE(x, key));
                BIND(x, key, function(val) { v2c(val); }, null);
            },
            "x-attr": function(x, el, attr, key) {
                let val = VALUE(x, key);
                if(val) val === true ? el.setAttribute(attr, true) : el.setAttribute(attr, val);
                else if(val === false) el.removeAttribute(attr);
                else el.setAttribute(attr, val);
            },
            "x-bind": function(x, el, attr, key) {
                attr = Date.now();
                function v2c(val) {
                    switch(el.type) {
                        case "checkbox":
                        case "radio":
                            val ? el.setAttribute("checked", true) : el.removeAtrribute("checked");
                        default:
                            el.value = val;
                    }
                }

                function c2v(e) {
                    let ex = x[$trigger];
                    x[$trigger] = attr;
                    switch(el.type) {
                        case "checkbox":
                        case "radio":
                            VALUE(x, key, el.checked ? el.value : "");
                        break;
                        default:
                            VALUE(x, key, el.value);
                    }
                    x[$trigger] = ex;
                }
                v2c(VALUE(x, key));
                BIND(x, key, function(val) { v2c(val); }, attr);
                el.addEventListener("change", c2v);
            },
            "x-on": function(x, el, attr, key) {
                console.log("v-on")
                if(x[key]) el.addEventListener(attr, x[key]);
                else console.error("unkonwn method '" + key + "'");
            },
            "x-ref": function(x, el, attr, key) {
                x.$refs[key] = el;
            }
        },
        SCAN_COUNT = 0,
        SCAN_DEPTH = 9,
        SCAN = function(x, root, O, depth) { // 属性扫描
            if(depth < SCAN_DEPTH)
            for(let el of root.children) {
                el.getAttributeNames().forEach(function(name) {
                    if(name[0] != 'x' || name[1] != '-') return;
                    let key = name.split(":"), val = el.getAttribute(name);
                    name = key[0];
                    key = key[1] || null;

                    if(FN[name]) FN[name](x, el, key, val);
                    else if(O && O[name] instanceof Function) O[name].call(x, el, key, val);
                    else console.error("未知属性 '"+ name +"'");
                });
                ++SCAN_COUNT;
                setTimeout(SCAN.bind(this, x, el, O, depth + 1), 0);
            }
            if(--SCAN_COUNT == 0) {
                x.$opts.ready.call(x);
            }
        },
        X = function X(root, O) { // 创建实例
            // if(!new.target) return new X(root, O);
            // 选项
            O = O || {};
            O.ready = O.ready || function() {}
            O.methods = O.methods || {}
            this[$bound] = {};
            this[$trigger] = false;
            this.$root = root;
            this.$refs = {};
            this.$opts = O;
            this.$i18n = O.i18n || {};
            delete O.i18n;
            // 数据
            WATCH(this, this, "", O.data || {});
            delete O.data;
            // 元素
            ++SCAN_COUNT;
            setTimeout(SCAN.bind(this, this, root, O, 0), 0);
            // 方法
            for(let name in O.methods) {
                this[name] = O.methods[name].bind(this);
            }
        };
    // 导出
    exports.X = X;
    exports.Y = Y;
})(typeof exports === "undefined" ? window : exports);
