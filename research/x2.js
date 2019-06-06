/* x.js @author terry.wuhao@gmail.com */
const
    _linkCallback_         = Symbol("linkCallback"),
    _linkCallbackSuppress_ = Symbol("linkCallbackSuppress");

/**
 * 设置连接回调
 * @param {Proxy} src 
 * @param {string} vname 
 * @param {Function} fn 
 */
function linkTo(src, vname, fn) {
    console.log("link", vname);
    let vn = vname.split("."), vl = vn.pop(), vv = src;
    for(let i=0;i<vn.length;++i) vv = vv[vn[i]];
    let cb = vv[_linkCallback_][vl];
    if(!cb) cb = vv[_linkCallback_][vl] = [];
    cb.push(fn);
}

let xpattern = /(\$\{[^\}]+\})/g;

/**
 * 属性单项绑定
 * @param {Proxy} src 
 * @param {string} vname 
 * @param {HTMLElement} el
 * @param {string} attr 属性名
 */
function linkToAttribute(src, el, name) {
    let es = e.getAttribute(name).split(xpattern);
    function doAttribute() {
        el.setAttribute( name, es.reduce((a, c) => {
            if(c[0] == '$') return a += fetchProperty(src, c.substring(2, c.length-1));
            else return a += c; 
        }, "") );
    }
    doAttribute();
    es.forEach((c) => {
        if(c[0] == '$') linkTo(src, c.substring(2, c.length-1), (nv, ov) => {
            doAttribute();
        });
    });
}

function linkToInnerText(src, vname, el) {
    let es = el.textContent.split(xpattern);
    function doText() {
        el.textContent = es.reduce((a, c) => {
            if(c[0] == '$') return a += fetchProperty(src, c.substring(2, c.length-1));
            else return a += c; 
        }, "");
    }
    doText()
    es.forEach((c) => {
        if(c[0] == '$') linkTo(src, c.substring(2, c.length-1), (nv, ov) => {
            doText();
        });
    });
}

function linkToSrc(src1, vname1, src2, vname2) {
    modifyProperty(src2, vname2, fetchProperty(src1, vname1));
    linkTo(src1, vname, (nv, ov) => {
        modifyProperty(src2, vname2, nv);
    });
}

/**
 * 进行 value 属性监听双向绑定
 * @param {Proxy} src 
 * @param {string} vname 
 * @param {HTMLInputElement} el 
 */
function linkToInputValue(src, vname, el) {
    el.value = fetchProperty(src, vname);
    let fn = (nv, ov) => {
        el.value = nv;
    };
    linkTo(src, vname, fn);

    el.addEventListener("change", (e) => {
        let nv;
        switch(el.type) {
        case "radio":
        case "checkbox":
            nv = el.checked ? el.value : null;
        break;
        default:
            nv = el.value;
        }
        modifyProperty(src, vname, nv, fn);
    });
}
/**
 * 
 * @param {Proxy} src 
 * @param {string} vname 
 */
function fetchProperty(src, vname) {
    let vn = vname.split("."), vl = vn.pop(), vv = src;
    for(let i=0;i<vn.length;++i) {
        vv = vv[vn[i]];
        if(typeof vv !== "object") throw new TypeError("property '" + vname + "' not found");
    }
    return vv[vl];
}
/**
 * 修改 Src 中对应属性值
 * @param {Proxy} src 
 * @param {string} vname 
 * @param {*} nv 
 * @param {Function} fn 可选, 屏蔽指定回调
 */
function modifyProperty(src, vname, nv, fn) {
    if(fn) src[_linkCallbackSuppress_].push(fn); // 屏蔽回调(防止递归触发)

    let vn = vname.split("."), vl = vn.pop(), vv = src;
    for(let i=0;i<vn.length;++i)vv = vv[vn[i]];
    vv[vl] = nv;

    if(fn) src[_linkCallbackSuppress_].pop(fn); // 屏蔽回调(防止递归触发)
}

/**
 * 生成一个可进行数据绑定的数据源对象
 * @param {object} dataSrc 
 * @param {string} pre 可选, 成员属性前缀
 */
function createSrc(dataSrc, depth = 0) {
    if(depth > 9) throw new RangeError("DataSource depth overflow");

    for(let [name, desc] of Object.entries(Object.getOwnPropertyDescriptors(dataSrc))) {
        // 函数方法照搬
        if(desc.value instanceof Function) continue;
        // 自定义 getter/setter 存在时沿用
        if(desc.get) continue;
        // typeof null === "object"
        if(desc.value === null) continue;
        // 层级的属性对象
        if(typeof desc.value === "object") { 
            dataSrc[name] = createSrc(desc.value, depth + 1);
            continue;
        }
        // 其他普通属性沿用
    }
    dataSrc[_linkCallbackSuppress_] = []; // 屏蔽的回调
    dataSrc[_linkCallback_] = {}; // 属性变更连接回调

    return new Proxy(dataSrc, {
        get(obj, key) {
            return obj[key];
        },
        set(obj, key, nv) {
            let ov = obj[key]; // 获取当前老值
            obj[key] = nv; // 设置本次新值
            // 忽略内部属性
            if(typeof key == "symbol") return true;
            // 变更回调
            triggerCallback(obj, key, nv, ov);
            return true;
        }
    });
}

function xdebug(module, action) {
    let argv = Array.from(arguments);
    argv.splice(0, 2, "%c[%cX%c] [%c" + module + "%c/%c" + action +"%c]",
        "color: #999", "color: #CC6666", "color: #999",
        "color: #6666CC", "color: #999", "color: #6666CC", "color: #999");
    console.debug.apply(console, argv);
}

function xsource(el, name) {
    if(el[name] instanceof Function) el["$"+name] = createSrc(el[name]());
    else if(el.constructor[name] instanceof Function) el["$"+name] = createSrc(el.constructor[name]());
    else el["$"+name] = createSrc({});
    delete el[name];
} 


function xdoText(src, e, es) {
    
}

function xdoAttr(src, e, name, es) {
    
}

function xdoScan(self, el) {
    for(let e of el.childNodes) {
        if (e instanceof Text) {
            let es = e.textContent.split(xpattern);
            if(es.length == 1) continue;
            xdoText(self.$data, e, es);
            es.forEach((c) => {
                if(c[0] == '$') linkTo(self.$data, c.substring(2, c.length-1), (nv, ov) => {
                    xdoText(self.$data, e, es);
                });
            });
        }
        else if (e instanceof HTMLElement) {
            e.getAttributeNames().forEach((name) =>  {
                if(name[0] != 'x' || name[1] != '-') return;
                if(name == "x-value") {
                    let attr = e.getAttribute(name);
                    linkToInputValue(self.$data, attr.substring(2, attr.length-1), e);
                }else{
                    
                }
            });
            if(!registerX[e.tagName]) xdoScan(self, e);
        }
    }
}

export class XComponent extends HTMLElement {
    constructor() {
        super();
        // 数据项
        xsource(this, "data");
        xsource(this, "prop");
    }
    static get observedAttributes() {
        if(this.prop instanceof Function) 
            return Object.getOwnPropertyNames(this.prop());
        else
            return [];
    }
    connectedCallback() {
        this.$ctr = xcontainer(this); // 上层容器
        xdoScan(this, this)
        this.dispatchEvent(new CustomEvent("connected"));
    }
    disconnectedCallback() {
        this.dispatchEvent(new CustomEvent("disconnected"));
    }
    attributeChangedCallback(name, ov, nv) {
        if(nv.substring(0, 2) == '${') { // 绑定

        }
        else { // 普通赋值, 存储数据
            if(this.$data.hasOwnProperty(name)) modifyProperty(this.$data, name, nv);
            else if(this.$prop.hasOwnProperty(name)) modifyProperty(this.$prop, name, nv);
        }
    }
    adoptedCallback(od, nd) {
        console.log("adopted");
    }
}



export let DebugApp;

export class XApplication extends XComponent {
    constructor() {
        super();
        DebugApp = this;
    }
}

class XForController extends XComponent {
    static prop() {
        return {"for": []};
    }
}

class XIfController extends XComponent {
    static prop() {
        return {"if": null};
    }
}

let registerQ = [], registerX = {}, registerTimeout;
function registerNext() {
    if(registerQ.length) {
        window.customElements.define.apply(window.customElements, registerQ.pop())
        setTimeout(registerNext, 0);
    }
}

function registerTagName(proto) {
    let tagName = [], i = 0, j = -1, s = "";
    for(i=0;i<proto.name.length;++i) {
        if(proto.name[i] >= 'A' && proto.name[i] <= 'Z') {
            s = proto.name.substring(j, i).toLowerCase();
            if(s.length > 0) tagName.push(s);
            j = i;
        }
    }
    s = proto.name.substring(j, i).toLowerCase();
    if(s.length > 0 && s != "component" && s != "controller") tagName.push(s);
    return tagName.join("-");
}

export function register(tagName, proto) {
    if(typeof tagName === "function") {
        proto = tagName;
        tagName = registerTagName(proto);
    }
    xdebug("Component", "register", proto.name, "=>", tagName);
    registerQ.push([tagName, proto]);
    registerX[tagName.toUpperCase()] = proto;
}

export function bootstrap(tagName, proto) {
    if(tagName || proto) register(tagName, proto);
    registerNext();
}

register("x-for", XForController);
register("x-if",  XIfController);
