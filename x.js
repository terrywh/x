/*! x.js v1.0.0 / (c) TerryWu / MIT */
const 
    _callback_ = Symbol("callback"),
    _depsCalc_ = Symbol("depCalc"),
    _depsDesc_ = Symbol("depDesc"),
    _proxyContainer = new WeakMap();

function invokeCallback($, field, value, origin) {
    let ctr = $[_callback_], key = field.split("."), val, cbs = [];
    for(let k of key) {
        if(!ctr) return;
        val = ctr["*"];
        // 监听 * 的监控项, 为控制调用顺序
        if(!!val) cbs.push.apply(cbs, val[_callback_]);
        ctr = ctr[k];
    }
    // 当前 ctr["*"] 监听的是: field.* 的数据, 不应触发
    // 精确字段的监控项
    if(ctr) cbs.push.apply(cbs, ctr[_callback_]);
    for(let i=cbs.length-1; i>=0; --i) { // 注意: 倒序调用
        cbs[i].call($, field, value, origin);
    }
}
// 监听组件数据变化
function watch($, field, cb) {
    let ctr = $[_callback_], key = field.split("."), val;
    if(!ctr) ctr = $[_callback_] = { [_callback_]: [] };
    for(let k of key) {
        val = ctr[k];
        if(!val) ctr = ctr[k] = { [_callback_]: [] };
        else ctr = val;
    }
    ctr[_callback_].push(cb);
}
// 删除指定的监听
function unwatch($, field, cb) {
    let ctr = $[_callback_], key = field.split("."), val;
    for(let k of key) {
        val = ctr[k];
        if(!val) return;
        else ctr = val;
    }
    ctr = ctr[_callback_];
    val = ctr.indexOf(cb);
    if(val != -1) ctr.splice(val, 1);
}
// 计算属性依赖
function calcDepends($, cl) {
    let depends = $[_depsCalc_] = [];
    cl.call($);
    $[_depsCalc_] = null;
    return depends;
}
// 生成 Observable 并将对应实现上报置 Observer = $ 中
function observe(src, pre, $) {
    if(exists(src)) return _proxyContainer.get(src); // 已进行监听
    // if(!$[_callback_]) $[_callback_] = {[_callback_]: []};
    if(!$[_depsCalc_]) $[_depsCalc_] = null; // 用于计算属性依赖计算
    if(!$[_depsDesc_]) $[_depsDesc_] = {}; // 计算属性依赖关系

    let proxy = new Proxy(src, {
        get(src, key) {
            let val = src[key];
            if(typeof key === "symbol") return val;
            if(!Array.isArray(src) && val instanceof Function) return val.call($);
            if(Array.isArray($[_depsCalc_])) $[_depsCalc_].push(pre + key);
            if(typeof val === "object" && val !== null) return observe(val, pre + key + ".", $);
            else return val;
        },
        set(src, key, val) {
            if(typeof key === "symbol") {
                src[key] = val;
                return true;
            }
            if(Array.isArray(src) && key === "length") return true;
            let old = src[key];
            // 值未修改的情况下，完全无需操作
            if(val === old) return true;

            else if(Array.isArray(val)) {
                if(_proxyContainer.has(old)) { // 已存在对应对象监控，调整其内部数据
                    old.splice.call(old, old.length);
                    old.push.apply(old, val);
                }else if(!_proxyContainer.has(val)) {
                    observe(val, pre + key + ".", $);
                    src[key] = val; // 建立了新的监控，需要保存对象引用
                }
            }
            else if(typeof val === "object" && val !== null) {
                if(_proxyContainer.has(old)) Object.assign(_proxyContainer.get(old), val);
                else if(!_proxyContainer.has(val)) observe(val, pre + key + ".", $);
            }
            else src[key] = val;
            invokeCallback($, pre + key, val, old);
            let dep = $[_depsDesc_][pre + key];
            if(dep) for(let key of dep) { // 计算属性: 仅支持顶级成员
                invokeCallback($, key, $.$data[key], null);
            }
            return true;
        },
        deleteProperty(src, key) {
            this.set(src, key, undefined);
            return Array.isArray(src) ? src.splice(key, 1) : delete src[key];
        }
    });
    _proxyContainer.set(src, proxy);
    if(!$.$data) {
        $.$data = proxy;
        // 仅顶级成员支持 "计算属性" 
        if(!Array.isArray(src)) for(let key in src) {
            let val = src[key];
            if(!(val instanceof Function)) continue;
            
            for(let k of calcDepends($, val)) {
                let deps = $[_depsDesc_][pre + k];
                if(!deps) deps = $[_depsDesc_][pre + k] = [];
                deps.push(pre + key);
            }
        }
    }
    
    return proxy;
}
// 对象是否已被 "观测" 监听
function exists(o) {
    return _proxyContainer.has(o);
}
// 确认对象是否是一个 Observer 监听对象
function isObserver($) {
    return  !!$.$data && !!$[_depsDesc_];

}

const _binding_ = Symbol("binding"),
    pattern_  = /(\$\{[^\}]+\})/g; // 形如：${abc}

// 简化多级数据访问
function getData(o, field) {
    if(Number.isInteger(field)) return field; // 此种情况仅用于 this.$index 返回循环下标
    if(field === "") return o;
    let key = field.split("."), ctr = o;
    for(let k of key) {
        if(!ctr) break;
        ctr = ctr[k];
    }
    return ctr;
}
// 简化多级数据访问
function setData(o, field, val) {
    let key = field.split("."), ctr = o, lst = key.pop();
    for(let k of key) {
        if(!ctr) break;
        ctr = ctr[k];
    }
    ctr[lst] = val;
}
// （若存在包裹）去壳： ${xxxxx} -> xxxxx 
// 引用： ${this...} -> pre...
function unwrapField(field, pre) {
    if(field[0] == '$') field = field.substring(2, field.length - 1);
    
    if(field == 'this') field = pre.substring(0, pre.length - 1);
    else if(field == 'this.$place') {
         // 循环 x-for 特殊用法
         field = pre.split(".");
         field.pop();
         field = (parseInt(field.pop()) || 0) + 1;
    }
    else if(field == 'this.$index') {
        // 循环 x-for 特殊用法
        field = pre.split(".");
        field.pop();
        field = parseInt(field.pop()) || 0;
    }
    else if(field.substring(0, 5) === 'this.') field = pre + field.substring(5);
    return field;
}

// Text 节点数据绑定
function bindText(el, binding, $, field) {
    let fn = function(field, value, origin) {
        el.textContent = value;
    }, val = getData($.$data, field);

    fn.field = field;
    fn.call($, field, val, val);
    if(Number.isInteger(field)) return;
    // 建立绑定
    watch($, field, fn);
    binding.push(fn);
}
// Text 节点扫描转换过程
function scanText(el, binding, $, pre) {
    let r = 0, n = el.textContent.split(pattern_).map((text) => {
        if(text[0] !== '$' || text[1] !== '{' || text[text.length-1] !== '}') return text;
        ++r;
        let el = new Text();
        bindText(el, binding, $, unwrapField(text, pre));
        return el;
    });
    if(r > 0) el.replaceWith.apply(el, n);
}
// 属性绑定 (HTML 元素属性)
function bindAttribute(el, name, binding, $, field) {
    let fn = function(field, value, origin) {
        el.setAttribute(name, value);
    }, val = getData($.$data, field);
    fn.field = field;
    fn.call($, field, val, val);
    if(Number.isInteger(field)) return;
    // 建立绑定
    watch($, field, fn);
    binding.push(fn);
}
// 属性绑定 (DOM 实例属性)
function bindProperty(el, name, binding, $, field) {
    let fn = function(field, value, origin) {
        el[name] = value;
        if(name === "value" && el instanceof HTMLInputElement
            && (el.type == "radio" || el.type == "checkbox")) {
            
            !!value ? el.checked = true : el.checked = false;
        }
    }, val = getData($.$data, field);
    fn.field = field;
    fn.call($, field, val, val); // 对应的 $.$data 中的数据项设置
    // 当所有组件绑定完成后，上面 el[name] 的操作应自行映射 attribute 属性项
    // 但若实际 el 的组件还未完成绑定，就需要额外进行一次
    if(!isObserver(el)) el.setAttribute(name, val); 
    if(Number.isInteger(field)) return;
    // 正向绑定: DATA.FIELD -> DOM.PROP
    watch($, field, fn);
    binding.push(fn);
    // 双向绑定: DOM.PROP -> DATA.FIELD
    if(name === "value") el.addEventListener("change", function(e) {
        if(el instanceof HTMLInputElement && (el.type == "radio" || el.type == "checkbox")) setData($.$data, field, el.checked ? 1 : 0);
        else setData($.$data, field, el.value);
    });
    else el.addEventListener("change:" + name, function(e) {
        setData($.$data, field, el[name]);
    });
}

function bindArray(el, binding, $, field) {
    let ctr = el.parentNode, begin = new Comment("for("+field+") {{{"), end = new Comment("}}} for("+field+")"),
        depth = field.split(".").length + 1, val = getData($.$data, field), 
        nodeContainer = new Map(); // 存储数组元素与对应DOM元素的映射，已方便在数组元素删除时，对应做元素清理

    el.replaceWith(begin, end);

    let append = function(field) { // 数组元素新增，创建对应 DOM 元素
        let node = el.cloneNode(true);
        // 分离单独的绑定数据, 方便清理
        let binding = node[_binding_];
        if(!binding) binding = node[_binding_] = [];
        scanNode(node, binding, $, field + ".", false);
        // 元素与字段关联
        if (nodeContainer.has(field)) nodeContainer.get(field).push(node);
        else nodeContainer.set(field, [node]);
        // 放入 DOM 树
        ctr.insertBefore(node, end);
    },
    remove = function(field) { // 字段删除时，清理对应 DOM 元素
        if(!nodeContainer.has(field)) return;
        nodeContainer.get(field).forEach((node) => {
            node.remove();
            for(let fn of node[_binding_]) unwatch($, fn.field, fn); // 解除在上面 append 过程中对应元素添加的绑定
        });
    }, fn = function(field, value, origin) {
        if(field.split(".").length != depth) return; // 仅监听处理本层数组元素的增删

        if(origin === undefined) append(field);
        else if (value === undefined) remove(field);
    };
    for(let i=0; i<val.length;++i) append(field + "." + i.toString());
    fn.field = field + ".*";
    // 建立绑定
    watch($, fn.field, fn);
    binding.push(fn);
}

function bindCondition(el, binding, $, field) {
    let ctr = el.parentNode, begin = new Comment("if("+field+") {{{"), end = new Comment("}}} if("+field+")"),
        node;
    el.replaceWith(begin, end);
    // 这里实际是将 元素重新放入 或 将其移出 文档树来实现的
    // 使用 display: none 等隐藏方式是，该元素还会被 querySelector 等获取到
    let append = function(field) {
        node = el.cloneNode(true);
        // 分离单独的绑定数据, 方便清理
        let binding = node[_binding_];
        if(!binding) binding = node[_binding_] = [];
        scanNode(node, binding, $, field + ".", false);
        // 放入 DOM 树
        ctr.insertBefore(node, end);
    },
    remove = function(field) {
        node.remove();
        for(let fn of node[_binding_]) unwatch($, fn.field, fn); // 解除在上面 append 过程中对应元素添加的绑定
    },
    fn = function(field, value, origin) {
        if(!!value === !!origin) return; // 真假未变
        !!value ? append(field) : remove();
    };
    if(!!getData($.$data, field)) append(field);
    fn.field = field;
    // 建立绑定
    watch($, fn.field, fn);
    binding.push(fn);
}
// 事件绑定
function bindEvent(el, event, binding, $, method) {
    el.addEventListener(event, $[method].bind($));
}
// 扫描待绑定属性
function scanProp(el, binding, $, pre) {
    if(el.hasAttribute("x-for")) { // 实际循环元素需要动态生成
        let field = unwrapField(el.getAttribute("x-for"), pre);
        el.removeAttribute("x-for");
        bindArray(el, binding, $, field);
        return false; // 标识: 不再进行成员扫描(内部动态代理进行)
    }
    else if(el.hasAttribute("x-if")) { // 同上
        let field = unwrapField(el.getAttribute("x-if"), pre);
        el.removeAttribute("x-if");
        bindCondition(el, binding, $, field);
        return false; // 标识: 不再进行成员元素扫描(内部动态代理进行)
    }
    else {
        // 扫描属性
        for(let name of el.getAttributeNames()) {
            if(name[0] != 'x' || name[1] != '-') continue;
            let key = name.split(":", 2); // 特殊的形式有 : 分隔
            if(key[0] == "x-ref") $.$xref && ($.$xref[el.getAttribute(name)] = el);
            else if(key[0] == "x-on") bindEvent(el, key[1], binding, $, el.getAttribute(name));
            else if(key[0] == "x-bbind") bindProperty(el, key[1], binding, $, unwrapField(el.getAttribute(name), pre)); // 双向
            else if(key[0] == "x-ubind") bindAttribute(el, key[1], binding, $, unwrapField(el.getAttribute(name), pre)); // 单项
            else if(key[0] == "x-value") bindProperty(el, "value", binding, $, unwrapField(el.getAttribute(name), pre)); // 双向:　特化 value 属性
            else bindAttribute(el, name.substring(2, name.length - 1), binding, $, unwrapField(el.getAttribute(name), pre)); // 单项: 简化的语法
            el.removeAttribute(name); // 由框架处理的属性置隐藏
        }
        return true;
    }
}
// 扫描指定节点，可选的扫描其下一个兄弟节点
function scanNode(node, binding, $, pre, next) {
    if(!node) return;
    // 使用 nextSibling 代替 childNodes[i] 遍历扫描，可以避免：由于
    //  在 scanText 中使用了替换机制: 元素（数量）变更
    // 导致的重复无效扫描问题
    if(next !== false) next = node.nextSibling;
    if(node instanceof Text) { 
        scanText(node, binding, $, pre);
    }else if(node instanceof HTMLElement) {
        if(scanProp(node, binding, $, pre)) // 对于某些特殊属性：x-for 等，不再扫描其成员元素
            scanNode(node.childNodes[0], binding, $, pre);
    }
    scanNode(next, binding, $, pre);
}
// 扫描元素并建立绑定关系
function scan(el, binding, $, pre) {
    // 默认情况下绑定均存储在顶级元素的 _binding_ 属性中（数组型动态元素处理时的清理机制）
    // 特殊的 x-for / x-if 会自行存储，便于对应数据项进行动态清理
    if(!binding) binding = el[_binding_];
    if(!binding) binding = el[_binding_] = [];

    scanNode(el.childNodes[0], binding, $, pre);
}

function getContainer(self, proto) {    while((self = self.parentNode)) if(self instanceof proto) break;
    return self;
}

function nameFromProto(proto) {
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

const _binding_$1 = Symbol["binding"],
    _attrDesc_ = Symbol["attrDesc"];

function extend(src, binding, $) {
    for(let key in src) { // 均为顶级成员
        Object.defineProperty($, key, {
            get() { return $.$data[key]; },
            set(val) {
                if($.constructor[_attrDesc_] && $.constructor[_attrDesc_][key]) $.setAttribute(key, val); // 定义为 attribute 的属性也需要同步更新
                $.$data[key] = val;
            }
        });
    }
    // 应用无上级包裹, 故无需产生通知事件(双向绑定支持)
    if($ instanceof Component) for(let key in src) { // 监听属性变更
        let fn = key === "value" ? function() {
            $.dispatchEvent(new Event("change"));
        } : function(field, value, origin) {
            $.dispatchEvent(new Event("change:" + key));
        };
        fn.field = key;
        watch($, key, fn); // 由于此种设置, 理论上仅能处理顶层元素
        binding.push(fn);
    }
}

function clearBinding(binding, $) {
    if(!binding) return;
    for(let fn of binding) {
        unwatch($, fn.field, fn);
    }
}

class Component extends HTMLElement {
    constructor() {
        super();
        // 数据源的描述信息
        let src = Object.assign(
            typeof this.constructor.data === "function"? this.constructor.data(this) : {}, // 数据成员定义
            Object.fromEntries(Object.getOwnPropertyNames(this).map((name) => [name, this[name]]))); // 目前已经设置的值需要覆盖继承
        // 创建 this.$data 成员 observable 对象
        observe(src, "", this);
        // 将 this.$data 成员映射为实例属性
        this[_binding_$1] = [];
        extend(src, this[_binding_$1], this);
        if(typeof this.constructor.shadow === "function") {
            let el = this.constructor.shadow(), shadow = this.attachShadow({mode: "open"});
            if(el instanceof HTMLTemplateElement) shadow.appendChild( document.importNode(el.content, true) ); // 模板
            else if(el instanceof Node) shadow.appendChild( el ); // 元素
            else if(typeof el === "string") shadow.innerHTML = el; // HTML
            else shadow.innerText = "<Unsupported Shadow Content>"; // 未知
        }
        this.$xref = {};   // 成员引用
        this.$xapp = null; // 应用容器
        this.$xctr = null; // 上层组件
        // 回调
        if(this.onCreated) setTimeout(this.onCreated.call(this), 0);
    }

    connectedCallback() {
        // 注意：获取上层容器时，若上层组件还未注册，则无法成功获取（需要合理安排组件注册顺序）
        this.$xapp = getContainer(this, Application);
        this.$xctr = getContainer(this, Component);
        if(this.$xctr === null) this.$xctr = this.$xapp;
        // 成员
        this.shadowRoot
            ? scan(this.shadowRoot, this[_binding_$1], this, "") // 自定义组件扫描其自定义 HTML 内容
            : scan(this, this[_binding_$1], this, ""); // 容器型扫描器元素内容
        // 回调
        if(this.onAttached) setTimeout(this.onAttached.call(this), 0);
    }

    disconnectedCallback() {
        clearBinding(this[_binding_$1], this);
        if(this.onDetached) setTimeout(this.onDetached.call(this), 0); // 回调
    }

    static get observedAttributes() {
        this[_attrDesc_] = {};
        if(typeof this.data === 'function') {
            let attrs = [], descs = Object.getOwnPropertyDescriptors(this.data());
            for(let name in descs) { // 遍历属性, 寻找数值/文本型数据项 映射为 attribute 属性项
                let desc = descs[name], type = typeof desc.value;
                if(type === "string" || type == "number") {
                    this[_attrDesc_][name] = type;
                    attrs.push(name);
                }
            }
            return attrs;
        }
        else return [];
    }
    // 属性项发生变更时，
    attributeChangedCallback(name, ov, nv) {
        let type = this.constructor[_attrDesc_][name];
        if(!type) return; // 未定义的属性项变更忽略
        if(type === "number") nv = parseFloat(nv);
        setData(this.$data, name, nv);
    }
}

class Application extends HTMLElement {
    constructor() {
        super();
        let src = typeof this.constructor.data === "function"
            ? this.constructor.data(this) : {};
        observe(src, "", this);
        this[_binding_$1] = [];
        extend(src, this[_binding_$1], this);
        // 应用程序为包含下述元素, 不创建 ShadowDOM 

        this.$xref = {};   // 成员引用
        if(this.onCreated) setTimeout(this.onCreated.call(this), 0);
    }

    connectedCallback() {
        scan(this, this[_binding_$1], this, ""); // 应用程序, 一定不包含 shadowRoot
        if(this.onAttached) setTimeout(this.onAttached.call(this), 0);
    }

    disconnectedCallback() {
        // 应用元素不应 detach 故无需解绑
        // clearBinding(this, this[_unbind_]);
        if(this.onDetached) setTimeout(this.onDetached.call(this), 0);
    }
    // 应用程序不导出属性
    // static get observedAttributes() {
    //     console.log("application");
    //     return [];
    // }
    
    // attributeChangedCallback(name, ov, nv) {
    //     // if(this.constructor[name] === "number") setData(this.$data, name, parseFloat(nv));
    //     // else setData(this.$data, name, nv); // 将属性变更映射到 this.$data 上
    // }
}
/**
 * 注册组件，请尽量保证组件从外到内的顺序注册(否则组件 this.$xctr / this.$xapp 可能无法获取)；
 * 函数可单个调用也可批量调用: 
 *  register([name,] proto, [name, ] proto, ....)
 *  register(name, desc, el, desc)
 */
function register() {
    let descs = Array.from(arguments);
    while(descs.length) {
        let name = descs.shift(), proto;
        if(typeof name === 'function') {
            proto = name;
            name = nameFromProto(proto);
        }else{
            proto = descs.shift();
        }
        if(typeof proto == "object") {
            name instanceof HTMLElement ? registerApplication(name, proto) : registerComponent(name, proto);
        }else{
            window.customElements.define(name, proto);
        }
    }
}

// 定义并注册应用
function registerApplication(el, desc) {
    window.customElements.define(el.tagName.toLowerCase(), class extends Application {
        constructor() {
            super();
            for(let key in desc) { // 继承方法
                let val = desc[key];
                if(typeof val === "function") this[key] = val;
            }
            // 上述继承的方法可能包 onCreate 但父类调用判定已经无效
            if(this.onCreated) setTimeout(this.onCreated.call(this), 0);
        }
        static data() {
            return typeof desc.data == "function" ? desc.data() : Object.assign({}, desc.data);
        }
    });
}

// 定义并注册组件
function registerComponent(name, desc) {
    window.customElements.define(name, class XComponent extends Component {
        constructor() {
            super();
            for(let key in desc) { // 继承方法
                let val = desc[key];
                if(typeof val === "function") this[key] = val;
            }
            // 上述继承的方法可能包 onCreate 但父类调用判定已经无效
            if(this.onCreated) setTimeout(this.onCreated.call(this), 0);
        }
        static data() {
            return typeof desc.data === "function" ? desc.data() : Object.assign({}, desc.data);
        }
        static shadow() {
            return typeof desc.shadow === "function" ? desc.shadow() : (desc.shadow || document.createElement("div"));
        }
    });
}

function X(x) {
    if(isObserver(x)) watch.apply(this, Array.from(arguments));
    else register.apply(this, Array.from(arguments));
}

X.Component   = Component;
X.Application = Application;

export default X;
