/* x.js @author terry.wuhao@gmail.com */
const  _bound_target_ = Symbol("bound-target")
    , _proxy_ = Symbol("proxy")
    , _bound_ = Symbol("bound")
    , _bound_computed_property_ = Symbol("bound-computed-property")
    , _bound_text_ = Symbol("bound-text")
    , _bound_html_ = Symbol("bound-html")
    , _bound_value_ = Symbol("bound-value")
    , _bound_if_ = Symbol("bound-if")
    , _computed_property_name_ = Symbol("computed-property-name")
    , _computed_property_deps_ = Symbol("computed-property-deps")
    , _computed_property_calc_ = Symbol("computed-property-calc")
    , _computed_property_rs_   = Symbol("computed-property-rs")
    , _debug_ = function (app, module, action) {
        let argv = Array.from(arguments);
        argv.splice(0, 2, "%c[%c" + app + "%c] [%c" + module + "%c/%c" + action +"%c]",
            "color: #999", "color: #CC6666", "color: #999",
            "color: #6666CC", "color: #999", "color: #6666CC", "color: #999");
        console.debug.apply(console, argv);
    };
let components = {};
class ComputedProperty {
    constructor(keys, calc) {
        this[_computed_property_deps_] = keys;
        this[_computed_property_calc_] = calc;
    }
};
export let debug = _debug_;
/**
 * 生成一个可进行数据绑定的数据源对象
 * @param {object} src 
 */
let createSource = (function () {
    // 回调的触发过程
    function trigger(self, src, key, nv, ov) {
        let cb = self[_bound_][key];
        if(!cb || !cb.length) return;
        for(let i=0;i<cb.length;++i) cb[i].call(src, nv, ov);
    }
    function create(self, src, pre, depth) {
        if(depth > 9) throw new RangeError("Source depth overflow");

        let source = new Proxy(src, {
            get(obj, key) {
                if(key === _proxy_) return true;
                let val = obj[key];
                if(val instanceof ComputedProperty) return val[_computed_property_rs_];
                if(typeof val === "function") return val.call(source);
                else return val;
            },
            set(obj, key, val) {
                let old = obj[key]; // 获取当前老值
                if(val instanceof ComputedProperty) val[_computed_property_rs_] = val;
                else obj[key] = val;
                // 不直接调用，以防止大量串联触发集中占用 CPU
                setTimeout(trigger, 0, self, source, pre + key, val, old);
                return true;
            }
        });
        for(let [key, desc] of Object.entries(Object.getOwnPropertyDescriptors(src))) {
            // 计算属性（依赖关系）
            let val = desc.value;
            if(val instanceof ComputedProperty) {
                val[_computed_property_name_] = pre + key;
                val[_computed_property_rs_] = val[_computed_property_calc_].call(source);
                val[_computed_property_deps_].forEach((key) => {
                    createBound(self, source, pre + key, val, _bound_computed_property_);
                });
                continue;
            }
            // 特定类型直接沿用
            if(val instanceof Function || desc.get || val === null) continue;
            // 层级的属性对象
            if(typeof val === "object") src[key] = create(self, val, pre + name + ".", depth + 1);
        }
        return source;
    }
    return function(self, src, pre, depth = 0) {
        return src.prototype && src instanceof Proxy ? src : create(self, src, pre, depth);
    }
})();

function getProperty(src, key) {
    let vn = key.split("."),
        vl = vn.pop(),
        vv = src;
    for(let i=0;i<vn.length;++i) {
        vv = vv[vn[i]];
        if(typeof vv !== "object") throw new TypeError("property '" + key + "' not found");
    }
    return vv[vl];
}

function setProperty(src, key, val) {
    let vn = key.split("."),
        vl = vn.pop(),
        vv = src;
    for(let i=0;i<vn.length;++i) vv = vv[vn[i]];
    vv[vl] = val;
}

function createBound(self, src, key, el, attr) {
    let bound;
    switch(attr) {
    case _bound_if_:
        bound = function(nv) {
            nv ? el[_bound_if_].replaceWith(el) : el.replaceWith(el[_bound_if_]) ;
        };
        break;
    case _bound_computed_property_:
        bound = function() {
            setProperty(src, el[_computed_property_name_], el[_computed_property_calc_].call(src));
        };
        break;
    case _bound_text_:
        bound = function(nv, ov) {
            el.textContent = nv;
        };
        break;
    case _bound_html_:
        bound = function(nv, ov) {
            el.innerHTML = nv;
        };
    case _bound_value_:
        bound = function(nv, ov) {
            if(el.value != nv) el.value = nv; // 判定，以防止循环触发 change 事件
        };
        el.addEventListener("change", (e) => {
            switch(el.type) {
            case "checkbox":
            case "radio":
                el.checked ? setProperty(src, key, el.value) : setProperty(src, key, null);
            break;
            default:
                setProperty(src, key, el.value);
            }
        });
        break;
    default: // _bound_attr_
        bound = function(nv, ov) {
            el.setAttribute(attr, nv);
        };
    }
    bound.key = key;
    bound.src = src;
    // 绑定关系记录, 销毁时进行清理
    let ctr1 = el[_bound_target_];
    if(!ctr1) ctr1 = el[_bound_target_] = [];
    ctr1.push(bound);

    let ctr2 = self[_bound_][key];
    if(!ctr2) ctr2 = self[_bound_][key] = [];
    ctr2.push(bound);
};

let scanSibling = (function() {
    const _pattern_    = /(\$\{[^\}]+\})/g;
    function scanSibling(self, el) {
        if(!el) return;
        // 下个元素扫描
        setTimeout(scanSibling, 0, self, el.nextSibling);
        // 需要先进行 nextSibling 否则下面替换过程可能导致序列中断
        if(el instanceof Text) {
            let es = el.textContent.split(_pattern_);
            es = es.map((el) => {
                if(el[0] != '$') return el;
                else {
                    let key = el.substring(2, el.length - 1);
                    el = document.createTextNode(getProperty(self.$data, key));
                    createBound(self, self.$data, key, el, _bound_text_)
                    return el;
                }
            });
            el.replaceWith.apply(el, es);
        }
        else if(el instanceof HTMLElement) {
            // 属性处理
            for(let attr of el.getAttributeNames()) {
                if(attr[0] != 'x' || attr[1] != '-') continue;
                let name = attr.substring(2), key = el.getAttribute(attr);
                if(attr == "x-value") {
                    el.value = getProperty(self.$data, key);
                    createBound(self, self.$data, key, el, _bound_value_);
                }
                else if(attr == "x-if") {
                    let cl = el, rl = new Comment("if");
                    cl[_bound_if_] = rl;
                    if(!getProperty(self.$data, key)) {
                        el.replaceWith(rl);
                    }
                    createBound(self, self.$data, key, el, _bound_if_);
                }
                else {
                    el.setAttribute(name, getProperty(self.$data, key));
                    el.removeAttribute(attr);
                    createBound(self, self.$data, key, el, attr.substring(2));
                }
            }
            // 自定义组件仅对属性进行扫描，内部元素由该组件负责处理
            if(!isCustomComponent(el)) setTimeout(scanSibling, 0, self, el.childNodes[0]);
            
        }
    }
    return scanSibling;
})();

function isCustomComponent(el) {
    // 不能使用表达式 `el instanceof BaseComponent` 进行组件判定，
    // 由于自定义组件初始化过程是异步的，该表达式值可能为 false
    return el.tagName && el.tagName.indexOf("-") > -1;
}
/**
 * 组件基础
 */
let BaseComponent = (function() {
    function getContainer(self, proto) {;
        while((self = self.parentElement)) if(self instanceof proto) break;
        return self;
    }
    
    class BaseComponent extends HTMLElement {
        constructor() {
            super();
            this[_bound_] = {};
            this.$ctr  = null;
            this.$app  = null;
            this.$data = createSource(this, typeof this.constructor.data == "function"
                ? this.constructor.data(this) : {}, "", 0);
        }
        connectedCallback() {
            this.$ctr = getContainer(this, BaseComponent); // 上层容器
            this.$app = getContainer(this, Application);
        }
        
        static get observedAttributes() {
            if(typeof this.data === 'function') return Object.getOwnPropertyNames(this.data());
            else return [];
        }
        attributeChangedCallback(name, ov, nv) {
            setProperty(this.$data, name, nv);
        }
    }
    return BaseComponent;
})();
/**
 * 容器组件
 */
export class Container extends BaseComponent {
    connectedCallback() {
        super.connectedCallback();
        scanSibling(this, this.childNodes[0]);
        if(this.onAttached) setTimeout(this.onAttached, 0);
    }
    disconnectedCallback() {
        super.disconnectedCallback();
        if(this.onDetached) setTimeout(this.onDetached, 0);
    }
}
/**
 * 应用程序
 */
export let Application = (function() {
    function removeNode(el) {
        _debug_("x.core", "app.elementOberserver","remove", el);
        if(el[_bound_]) {
            el[_bound_].forEach((bound) =>{
                let ctr = bound.src[_bound_][bound.key];
                ctr.splice(ctr.indexOf(bound));
            });
        }
        el.childNodes.forEach(removeNode);
    }
    function appendNode(el) {
        _debug_("x.core", "app.elementOberserver","append", el);
    }
    function observe(mutations) {
        for(let mutation of mutations) {
            // 清理被删除的元素的绑定关系(防止内存泄漏)
            for(let el of mutation.removedNodes) removeNode(el);
            for(let el of mutation.addedNodes) appendNode(el);
        }
    }
    // 应用组件的特殊性（最上层容器组件）
    class Application extends BaseComponent {
        connectedCallback() {
            super.connectedCallback();
            this.$obs = new MutationObserver(observe);
            this.$obs.observe(this, { // 监听元素变更
                childList: true,
                subtree: true,
            });
            scanSibling(this, this.childNodes[0]);
            if(this.onAttached) setTimeout(this.onAttached, 0);
        }
        disconnectedCallback() {
            super.disconnectedCallback();
            this.$obs.disconnect();
            if(this.onDetached) setTimeout(this.onDetached, 0);
        }
    }
    return Application;
})();
/**
 * 使用 Shadow DOM 的组件
 */
export class Component extends BaseComponent {
    constructor() {
        super();
        let shadow = this.attachShadow({mode: "open"});
        shadow.appendChild(this.constructor.template());
        // shadow.innerHTML = "<h2><slot></slot> ${name}!";
    }
    connectedCallback() {
        super.connectedCallback();
        scanSibling(this, this.shadowRoot.childNodes[0]);
        if(this.onAttached) setTimeout(this.onAttached, 0);
    }
    disconnectedCallback() {
        super.disconnectedCallback();
        if(this.onDetached) setTimeout(this.onDetached, 0);
    }
}
/**
 * 注册组件定义
 * 注意: 请依照依赖顺序依次定义；
 */
export let define = (function() {
    let timeout, q = [];
    function next(tagName, proto) {
        if(q.length) { // 倒序注册流程
            let ce = q.pop();
            window.customElements.define.apply(window.customElements, ce);
            setTimeout(next, 0);
        }
    }
    function name(proto) {
        let tagName = [], i = 0, j = -1, s = "";
        for(i=0;i<proto.name.length;++i) {
            if(proto.name[i] >= 'A' && proto.name[i] <= 'Z') {
                s = proto.name.substring(j, i).toLowerCase();
                if(s.length > 0) tagName.push(s);
                j = i;
            }
        }
        s = proto.name.substring(j, i).toLowerCase();
        if(s.length > 0 && s != "component" && s != "controller" && s != "container") tagName.push(s);
        return tagName.join("-");
    }
    return function(tname, proto) {
        if(typeof tname === 'function') {
            proto = tname;
            tname = name(proto);
        }
        _debug_("x.core", "define", tname);
        // 由于实际元素的 define 延后（且异步），同步记录组件名映射
        components[tname.toUpperCase()] = proto;
        q.push([tname, proto]);
        clearTimeout(timeout);
        timeout = setTimeout(next, 50);
    };
})();
/**
 * 计算属性（可选依赖描述）
 */
export function computed() {
    let depend = Array.from(arguments),
        getter = depend.pop();
    
    return new ComputedProperty(depend, getter);
};
// // 流程控制标签：x-if 
// define(class XIfController extends BaseComponent {
//     constructor() {
//         super();
//         console.log(this.innerHTML);
//     }
//     static data(self) {
//         if(self) {
//             return new Proxy({}, {
//                 get(key) {
//                     return self.$ctr.$data[key];
//                 },
//                 set(key, val) {
//                     self.$ctr.$data[key] = val;
//                 }
//             });
//         }else{
//             return ["condtion"];
//         }
//     }
//     connectedCallback() {
//         super.connectedCallback();
//         console.log(this.$ctr);
//         console.log(this.innerHTML);
//     }
// })