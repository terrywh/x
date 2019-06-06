"use strict";

import {observe, watch, unwatch} from "./observable.js";
import {scan, setData, getData} from "./binding.js";

function getContainer(self, proto) {;
    while((self = self.parentNode)) if(self instanceof proto) break;
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

const _binding_ = Symbol["binding"],
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
        binding.push(fn)
    }
}

function clearBinding(binding, $) {
    if(!binding) return;
    for(let fn of binding) {
        unwatch($, fn.field, fn);
    }
}

export class Component extends HTMLElement {
    constructor() {
        super();
        // 数据源的描述信息
        let src = Object.assign(
            typeof this.constructor.data === "function"? this.constructor.data(this) : {}, // 数据成员定义
            Object.fromEntries(Object.getOwnPropertyNames(this).map((name) => [name, this[name]]))); // 目前已经设置的值需要覆盖继承
        // 创建 this.$data 成员 observable 对象
        observe(src, "", this);
        // 将 this.$data 成员映射为实例属性
        this[_binding_] = [];
        extend(src, this[_binding_], this);
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
            ? scan(this.shadowRoot, this[_binding_], this, "") // 自定义组件扫描其自定义 HTML 内容
            : scan(this, this[_binding_], this, ""); // 容器型扫描器元素内容
        // 回调
        if(this.onAttached) setTimeout(this.onAttached.call(this), 0);
    }

    disconnectedCallback() {
        clearBinding(this[_binding_], this);
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

export class Application extends HTMLElement {
    constructor() {
        super();
        let src = typeof this.constructor.data === "function"
            ? this.constructor.data(this) : {};
        observe(src, "", this);
        this[_binding_] = [];
        extend(src, this[_binding_], this);
        // 应用程序为包含下述元素, 不创建 ShadowDOM 

        this.$xref = {};   // 成员引用
        if(this.onCreated) setTimeout(this.onCreated.call(this), 0);
    }

    connectedCallback() {
        scan(this, this[_binding_], this, ""); // 应用程序, 一定不包含 shadowRoot
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
export function register() {
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