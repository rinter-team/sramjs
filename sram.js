;var sram = (function (global) {
    'use strict';

    var slice = Array.prototype.slice,
        rgExt = /\.(js|css)(?=[?&,]|$)/i,
        S = {};

    S.name = 'sram';

    S.version = '1.0.0';

    /**
     * options 默认配置
     */
    S.defualtOptions = {
        hash: '',
        alias: {},
        depends: {},
        baseUrl: null,
        comboUrl: null,
        combine: false,
        maxUrlLength:2000
    };

    S.cache = {};

    /**
     * 配置参数，将数组对象进行拷贝
     * @param {object} obj
     */
    S.config = function(obj){
        var options = S.defualtOptions;
        for(var key in obj){
            var data = options[key],
                value = obj[key],
                t = type(data);

            if (t === 'object') {
                for(var k in value){
                    data[k] = value[k];
                }
            } else {
                if (t === 'array'){
                    value = data.concat(value);
                }
                options[key] = value;
            }
        }
        return options;
    };

    /**
     * 别名配置
     * @param {string} name
     * @param {string} alias
     */
    S.alias = function(name, alias){
        var aliasMap = S.defualtOptions.alias;

        if (arguments.length > 1) {
            aliasMap[name] = alias;
            return S.alias(name);
        }

        while (aliasMap[name] && name !== aliasMap[name]) {
            switch (type(aliasMap[name])) {
                case 'function':
                    name = aliasMap[name](name);
                    break;
                case 'string':
                    name = aliasMap[name];
                    break;
            }
        }
        return name;
    };

    S.getCache = function(id){
        var  res = S.cache[id];
        if (res) {
            return res;
        }
        return null;
    };

    /**
     * 加载并使用模块
     * @param {string & array} names
     * @param {function} onload
     */
    S.use = function(names, onload){
        if (type(names) === 'string') names = [names];
        var reactor = new Reactor(names, function(){
            var args = [];
            for(var i = 0; i < names.length; i++){
                args.push(require(names[i]));
            }
            if (onload) onload.apply(S, args);
        });
        reactor.run();
    };

    /**
     * 定义一个模块
     * @param {string} id
     * @param {function} factory
     */
    S.define = function (id, factory) {
        S.cache[id] = {
            id: id,
            loaded: 'loaded',
            factory: factory
        };
    };

    /**
     * 获取一个模块
     * @param {string} name
     */
    function require(name) {
        var id = S.alias(name),
            module = S.getCache(id);

        if (fileType(id) !== 'js') return;
        if (!module) {
            error(new Error('failed to require "' + name + '"'));
            return null;
        }
        if (type(module.factory) === 'function') {
            var factory = module.factory;
            delete module.factory;
            try {
                //此回调抛错后处理
                factory.call(S, require, module.exports = {}, module);
            } catch (e) {
                e.id = id;
                throw (scrat.traceback = e);
            }
        }
        return module.exports;
    }

    /**
     * 加载CSS或者JS
     * @param {string} url
     * @param {obejct} options
     */
    S.load = function (url, options) {

        if (type(options) === 'function') {
            options = {onload: options};
            if (type(arguments[2]) === 'function') options.onerror = arguments[2];
        }

        function onerror(e) {
            clearTimeout(tid);
            clearInterval(intId);
            e = (e || {}).error || new Error('load url timeout');
            e.message = 'Error loading url: ' + url + '. ' + e.message;
            if (options.onerror) options.onerror.call(S, e);
            else throw e;
        }

        var t = options.type || fileType(url),
            isScript = t === 'js',
            isCss = t === 'css',
            isOldWebKit = +navigator.userAgent
                    .replace(/.*AppleWebKit\/(\d+)\..*/, '$1') < 536,
            head = document.head || document.getElementsByTagName('head')[0],
            node = document.createElement(isScript ? 'script' : 'link'),
            supportOnload = 'onload' in node,
            tid = setTimeout(onerror, (options.timeout || 20) * 1000),
            intId, intTimer;

        if (isScript) {
            node.type = 'text/javascript';
            node.async = false;
            node.src = url;
        } else {
            if (isCss) {
                node.type = 'text/css';
                node.rel = 'stylesheet';
            }
            node.href = url;
        }
        node.onload = node.onreadystatechange = function () {
            if (node && (!node.readyState ||
                /loaded|complete/.test(node.readyState))) {
                clearTimeout(tid);
                clearInterval(intId);
                node.onload = node.onreadystatechange = null;
                //if (isScript && head && node.parentNode) head.removeChild(node);
                if (options.onload) options.onload.call(S);
                node = null;
            }
        };
        node.onerror = onerror;

        head.appendChild(node);

        // trigger onload immediately after nonscript node insertion
        if (isCss) {
            if (isOldWebKit || !supportOnload) {
                intTimer = 0;
                intId = setInterval(function () {
                    if ((intTimer += 20) > ((options.timeout || 20) * 1000) || !node) {
                        clearTimeout(tid);
                        clearInterval(intId);
                        return;
                    }
                    if (node.sheet) {
                        clearTimeout(tid);
                        clearInterval(intId);
                        if (options.onload) options.onload.call(S);
                        node = null;
                    }
                }, 20);
            }
        } else if (!isScript) {
            if (options.onload) options.onload.call(S);
        }
    };

    var Reactor = function(names, callback){
        this.length = 0;
        this.depends = {};
        this.depended = {};
        this.push.apply(this, names);
        this.callback = callback;
    };

    var rproto = Reactor.prototype;

    rproto.push = function(){
        var that = this,
            args = slice.call(arguments);

        function onload() {
            if (--that.length === 0) that.callback();
        }
        for(var i = 0, len = args.length; i < len; i++) {

            var arg = args[i],
                id = S.alias(arg),
                type = fileType(id),
                res = S.getCache(id);

            if (!res) {
                res = S.cache[id] = {
                    id: id,
                    loadState: 'waiting'
                };
            } else if (that.depended[id] || res.loadState === 'loaded') continue;

            if (!res.onload) res.onload = [];

            that.depended[id] = 1;

            that.push.apply(that, S.defualtOptions.depends[id] || []);

            if ((type === 'css') || (type === 'js' && !res.factory && !res.exports)) {
                (that.depends[type] || (that.depends[type] = [])).push(res);
                ++that.length;
                res.onload.push(onload);
            }
        }
    };

    function makeOnload(deps) {
        deps = deps.slice();
        return function (e) {
            if(e) error(e);
            for(var i = 0; i < deps.length; i++){
                var res = deps[i];
                res.loadState = !e ? 'loaded' : 'loadFail';
                while (res.onload && res.onload.length) {
                    var onload = res.onload.shift();
                    onload.call(res);
                }
            }
        }
    }

    rproto.run = function(){
        var that = this,
            options = S.defualtOptions,
            combine = options.combine,
            deps = this.depends,
            depends = (deps.css || []).concat(deps.js || []);

        if (this.length === 0) return this.callback();

        if (combine) {
            resourceCombo(deps.css || []);
            resourceCombo(deps.js || []);
        }else{
            for(var i = 0; i < depends.length; i++){
                var res = depends[i];
                if((res.loadState === 'waiting' && res.loadState !== 'loading')
                    || res.loadState === 'loadFail'){
                    res.loadState = 'loading';
                    var onload = makeOnload([res]);
                    S.load(that.genUrl(res.id), onload, onload);
                }
            }
        }

        function resourceCombo (resdeps) {
            var urlLength = 0,
                ids = [],
                deps = [];
            for(var i = 0; i < resdeps.length; i++){
                var res = resdeps[i],
                    onload;
                if((res.loadState === 'waiting' && res.loadState !== 'loading')
                    || res.loadState === 'loadFail') {
                    if (urlLength + res.id.length < options.maxUrlLength) {
                        urlLength += res.id.length;
                        ids.push(res.id);
                        res.loadState = 'loading';
                        deps.push(res);
                    } else {
                        onload = makeOnload(deps);
                        S.load(that.genUrl(ids), onload, onload);
                        urlLength = res.id.length;
                        ids = [res.id];
                        deps = [res];
                    }
                    if (i === resdeps.length - 1) {
                        onload = makeOnload(deps);
                        S.load(that.genUrl(ids), onload, onload);
                    }
                }
            }
        }
    }

    rproto.genUrl = function (ids) {
        if (type(ids) === 'string') ids = [ids];

        var options = S.defualtOptions,
            url = options.combine && options.comboUrl || options.baseUrl;

        switch (type(url)) {
            case 'string':
                url = url.replace('%s', ids.join(','));
                break;
            case 'function':
                url = url(ids);
                break;
            default:
                url = ids.join(',');
        }

        return url + (~url.indexOf('?') ? '&' : '?') + '_hash=' + options.hash;
    };

    function fileType(str) {
        var ext = '';
        str.replace(rgExt, function (m, $1) {
            ext = $1;
        });
        if (ext !== 'js' && ext !== 'css') ext = 'unknown';
        return ext;
    }

    function type(obj) {
        var t;
        if (obj == null) {
            t = String(obj);
        } else {
            t = Object.prototype.toString.call(obj).toLowerCase();
            t = t.substring(8, t.length - 1);
        }
        return t;
    }

    function error() {
        if (console && type(console.error) === 'function') {
            console.error.apply(console, arguments);
        }
    }

    global.define = S.define;

    return S;

})(window);