### 简介
这是一个基于 ES6 现代浏览器支持实现的，非常简单的 MVVM 前端框架；提供了 MVVM 框架最基本的数据监听、绑定、计算属性、列表、条件、组件封装等功能；

编写这个框架的主要目的是为了学习 MVVM 框架相关的技术，搞清楚 ”数据双向绑定“ 及 ”动态元素“ 控制机制等等；`/research` 目录中是研究时产生的半成品；

框架使用最简单的 `模板` 机制，不需要 `Webpack` / `Babel` 等动态打包编译，不使用使用 `eval` 等动态机制（故此，无法在绑定中使用计算、三元、函数调用等表达式）；

* `src/observable.js` - 数据监听器，用于对数据修改进行监听和上报（无依赖）；
* `src/binding.js` - 实现数据（双向）绑定及 `x-for` / `x-if` 等动态绑定机制，依赖 `src/observable.js`；
* `src/component.js` - 简化 WebComponent 开发进行的封装，配合上述绑定机制可实现双向绑定，依赖 `src/binding.js` 及 `src/observable.js`；
* `src/x.js` - 提供一个对组件创建及数据监听的简单入口，依赖 `src/component.js` 及 `src/observable.js`；
* `x.min.js` - 独立的 `x.js` 完整打包（无依赖）；

由于实现非常简单，代码量也很小，推荐想要了解、学习 MVVM 框架工作原理的同学阅读源代码;

| Source   | S Minified | GZip         |
| ------   | --------   | -----------  |
| 23.2 KiB | 9.9 KiB    | 3.2 ~ 3.5KiB |

### 使用
1. 下载 `x.js` / `x.min.js` 或使用 `https://terrywh.github.io/x/x.min.js` 引用，例如：
``` 
import X from "https://terrywh.github.io/x/x.min.js";
X(document.querySelector("#app"), {....});
```

2. 下载 `src/*.js` 或使用 `https://terrywh.github.io/x/src/*.js` 引用，例如：
``` Javascript
import {observe, watch} from "https://terrywh.github.io/x/src/observable.js";
let ob = {};
observe({"x":"x"}, "", ob);
watch(ob, "x", (field, value, origin) => {
    console.log(field, "changed from", origin, "to", value);
});
```

### 文档
请参考对应 `*.html` 文件中的示例及代码注释:
* [observable.js](https://terrywh.github.io/x/src/observable.js) / [observable.html](https://terrywh.github.io/x/src/observable.html) - 属性（数据）监听；
* [binding.js](https://terrywh.github.io/x/src/binding.js) / [binding.html](https://terrywh.github.io/x/src/binding.html) - 属性（数据）事件（动作）绑定；
* [component.js](https://terrywh.github.io/x/src/component.js) / [component.html](https://terrywh.github.io/x/src/component.html) - 基于 WebComponent 的组件；
* [x.js](https://terrywh.github.io/x/src/x.js) / [x.html](https://terrywh.github.io/x/src/x.html) - 简化入口封装；

### 版权声明
本软件使用 MIT 许可协议；
