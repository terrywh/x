"use strict";

import { register, Component, Application } from "./component.js"
import { watch, isObserver } from "./observable.js";

function X(x) {
    if(isObserver(x)) watch.apply(this, Array.from(arguments));
    else register.apply(this, Array.from(arguments));
}

X.Component   = Component;
X.Application = Application;

export default X;
