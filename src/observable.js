"use strict";

const 
    _callback_ = Symbol("callback"),
    _depsCalc_ = Symbol("depCalc"),
    _depsDesc_ = Symbol("depDesc"),
    _proxyContainer = new WeakMap();


function invokeContainer(ctr, $, field, value, origin) {
    ctr[_callback_].forEach((cb) => cb.call($, field, value, origin));
    // for(let [key, cb] of ctr.entries()) {
    //     if(cb instanceof Function) cb.call($, field, value, origin);
    // }
}

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
export function watch($, field, cb) {
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
export function unwatch($, field, cb) {
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
export function calcDepends($, cl) {
    let depends = $[_depsCalc_] = [];
    cl.call($);
    $[_depsCalc_] = null;
    return depends;
}
// 生成 Observable 并将对应实现上报置 Observer = $ 中
export function observe(src, pre, $) {
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
export function exists(o) {
    return _proxyContainer.has(o);
}
// 确认对象是否是一个 Observer 监听对象
export function isObserver($) {
    return  !!$.$data && !!$[_depsDesc_];

}