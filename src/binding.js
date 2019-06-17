"use strict";

import {watch, unwatch, isObserver} from "./observable.js";

const _binding_ = Symbol("binding"),
    pattern_  = /(\$\{[^\}]+\})/g; // 形如：${abc}

// 简化多级数据访问
export function getData(o, field) {
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
export function setData(o, field, val) {
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
        if(value === origin) return; // 未发生变更
        !!value ? append(field) : remove(field);
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
            let key = name.split(":", 2), val = el.getAttribute(name); // 特殊的形式有 : 分隔
            if(!val) ;
            else if(key[0] == "x-ref") $.$xref && ($.$xref[val] = el);
            else if(key[0] == "x-on") bindEvent(el, key[1], binding, $, val);
            else if(key[0] == "x-bbind") bindProperty(el, key[1], binding, $, unwrapField(val, pre)); // 双向
            else if(key[0] == "x-ubind") bindAttribute(el, key[1], binding, $, unwrapField(val, pre)); // 单项
            else if(key[0] == "x-value") bindProperty(el, "value", binding, $, unwrapField(val, pre)); // 双向:　特化 value 属性
            else bindAttribute(el, name.substring(2, name.length - 1), binding, $, unwrapField(val, pre)); // 单项: 简化的语法
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
export function scan(el, binding, $, pre) {
    // 默认情况下绑定均存储在顶级元素的 _binding_ 属性中（数组型动态元素处理时的清理机制）
    // 特殊的 x-for / x-if 会自行存储，便于对应数据项进行动态清理
    if(!binding) binding = el[_binding_];
    if(!binding) binding = el[_binding_] = [];

    scanNode(el.childNodes[0], binding, $, pre);
}
