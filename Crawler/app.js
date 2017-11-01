"use strict";
var express = require('express');
var fs = require('fs');
var request = require('request');
var pathLib = require('path');
var cheerio = require('cheerio');
var util = require('util');
var formidable = require('formidable');
var emitter = require('events').EventEmitter.defaultMaxListeners = 0;
var Promise = require('bluebird');
var urlLib = require('url');
var app = express();
//Url data holder
var Url = (function () {
    function Url(url) {
        this.path = url;
        this.children = new Array();
    }
    return Url;
}());
exports.Url = Url;
//Crawler class is used to crawl a given URL and create his tree, according to desired layers.
var Crawler = (function () {
    function Crawler() {
    }
    Crawler.prototype.writeUrlToJson = function (url, path) {
        var data = url.toString();
        fs.writeFile(path, JSON.stringify(url, null, 4), function (err) {
            if (err) {
                console.error(err);
                return;
            }
            ;
            console.log("Wrote file " + path);
        });
    };
    //check if a url is active
    Crawler.prototype.checkIfActive = function (addr) {
        return new Promise(function (resolve, reject) {
            //give it a 5 second chance to respond
            var options = { url: addr, timeout: 5000 };
            request(options, function (error, response, html) {
                if (error)
                    reject(error);
                else
                    resolve(addr);
            });
        });
    };
    //get all active url's on a webpage
    Crawler.prototype.getActiveUrls = function (url) {
        return new Promise(function (resolve, reject) {
            var crawler = new Crawler();
            var result = new Array();
            var callStack = [];
            //make a request to the given url
            request(url.path, function (error, response, html) {
                if (error)
                    reject(error);
                else {
                    //load all "a" elements
                    var $_1 = cheerio.load(html);
                    $_1("a").each(function () {
                        var addr = $_1(this).attr('href');
                        if (addr !== undefined)
                            callStack.push(crawler.checkIfActive(addr));
                    });
                    //wait for all promises to resolve, and ignore errors
                    Promise.all(callStack.map(function (p) { return p.catch(function (e) { return e; }); })).then(function (results) {
                        results.forEach(function (r) {
                            //dont include any url that got an error
                            if (!r.toString().startsWith('Error'))
                                result.push(new Url(r));
                        });
                        //return the result array all together   
                    }).then(function () { return resolve(result); });
                }
            });
        });
    };
    //add active url's to the root 
    Crawler.prototype.constructTree = function (root, layers) {
        var _this = this;
        return new Promise(function (resolve, reject) {
            var promises = [];
            //construct the root node
            var promise = Promise.resolve(_this.constructNode(root));
            layers--;
            //finish if only 1 layer is required
            if (layers == 0)
                promise = promise.then(function () { return resolve(root); });
            //repeat adding children
            while (layers-- > 0) {
                promise = promise.then(function (children) { return _this.constructNodes(children); });
            }
            //return the root node
            promise.then(function () { return resolve(root); });
        });
    };
    //add active url's to a node
    Crawler.prototype.constructNode = function (url) {
        return new Promise(function (resolve, reject) {
            console.log('constructing + ' + url.path);
            var crawler = new Crawler();
            //get active urls in the page
            crawler.getActiveUrls(url).then(function (results) {
                console.log('active urls given to ' + url.path + ':' + results.length);
                //add active urls to the parent
                results.forEach(function (c) { return url.children.push(c); });
                //return the children
            }).then(function () { return resolve(url.children); });
        });
    };
    //add active url's to a number of nodes
    Crawler.prototype.constructNodes = function (urls) {
        var crawler = new Crawler();
        return new Promise(function (resolve, reject) {
            var promises = [];
            var allChildren = [];
            urls.forEach(function (u) {
                promises.push(crawler.constructNode(u));
            });
            //wait for every promise to resolve
            return Promise.all(promises).then(function () {
                //urls have children by now - add them to a container
                urls.forEach(function (url) {
                    url.children.forEach(function (c) { return allChildren.push(c); });
                });
                //pass all of the children to the next iteration
                resolve(allChildren);
            });
        });
    };
    /**
     * Create a tree, starting from the given url, containing the given number of layers.
     * This function is "thenable".
     * @param url - url to crawl
     * @param layers - the rank of the resulting tree
     * @param path - a path to save the Json file to
     */
    Crawler.prototype.crawl = function (url, layers, path) {
        var _this = this;
        return new Promise(function (resolve, reject) {
            var crawler = new Crawler();
            var mainUrl = new Url(url);
            crawler.constructTree(mainUrl, layers).catch(function (e) { return e; }).then(function () {
                _this.writeUrlToJson(mainUrl, path);
                resolve(url);
            });
        });
    };
    return Crawler;
}());
exports.Crawler = Crawler;
//any get request to the root will show the index page(which has a form)
app.get('/', function (req, res) {
    res.sendFile(pathLib.join(__dirname + '/index.html'));
});
//handles the posted form
app.post('/', function (req, res) {
    var form = new formidable.IncomingForm();
    form.parse(req, function (err, fields, files) {
        if (err)
            throw err;
        var crawler = new Crawler();
        var urlField = fields['url'];
        var layersField = fields['layers'];
        //crawl the given url
        crawler.crawl(urlField, layersField, "./result.json")
            .then(function (url) { return res.send("Crawling [" + url + "] is done, check file in the project folder"); });
    });
});
app.listen('8081');
exports = module.exports = app;
//# sourceMappingURL=app.js.map