

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
export class Url {
    path: string;
    children: Array<Url>;
    

    constructor(url: string) {
        this.path = url;
        this.children = new Array<Url>();
    }
}


//Crawler class is used to crawl a given URL and create his tree, according to desired layers.
export class Crawler {
    
    writeUrlToJson(url: Url,path: string) {
        var data = url.toString();
        fs.writeFile(path, JSON.stringify(url,null,4), (err) => {
            if (err) {
                console.error(err);
                return;
            };
            console.log("Wrote file " + path);
        });

    }

    //check if a url is active
    checkIfActive(addr: string) {
        return new Promise((resolve, reject) => {
            //give it a 5 second chance to respond
            var options = {url:addr, timeout:5000};
            request(options, function (error, response, html) {
                if (error) reject(error);
                else resolve(addr);
            })
        });
    }

    //get all active url's on a webpage
    getActiveUrls(url: Url) {
        return new Promise((resolve, reject) => {
            let crawler: Crawler = new Crawler();
            let result: Array<Url> = new Array<Url>();
            let callStack = []
            //make a request to the given url
            request(url.path, function (error, response, html) {
                if (error) reject(error);
                else {
                    //load all "a" elements
                    let $ = cheerio.load(html);
                    $("a").each(function () {
                        let addr = $(this).attr('href');
                        if (addr !== undefined)
                            callStack.push(crawler.checkIfActive(addr));
                    });

                    //wait for all promises to resolve, and ignore errors
                    Promise.all(callStack.map(p => p.catch(e => e))).then(results => {
                        results.forEach((r) => {
                            //dont include any url that got an error
                            if (!r.toString().startsWith('Error'))
                                result.push(new Url(r));
                        });
                     //return the result array all together   
                    }).then(() => resolve(result));
                }
            });
        });

    }

    //add active url's to the root 
    constructTree(root: Url, layers: number) {
        return new Promise((resolve, reject) => {
            var promises = [];
            //construct the root node
            var promise = Promise.resolve(this.constructNode(root));
            layers--;
            //finish if only 1 layer is required
            if (layers == 0)
                promise = promise.then(() => resolve(root));
            //repeat adding children
            while (layers-- > 0) {
                promise = promise.then((children) => this.constructNodes(children));
            }
            //return the root node
            promise.then(() => resolve(root));

        });
    }

    //add active url's to a node
    constructNode(url: Url) {
        return new Promise((resolve, reject) => {
            console.log('constructing + ' + url.path);
            let crawler: Crawler = new Crawler();
            //get active urls in the page
            crawler.getActiveUrls(url).then(results => {
                console.log('active urls given to ' + url.path + ':' + results.length);
                //add active urls to the parent
                results.forEach(c => url.children.push(c)); 
                //return the children
            }).then(() => resolve(url.children));
        });
    }

    //add active url's to a number of nodes
    constructNodes(urls: Url[]) {
        let crawler: Crawler = new Crawler();
        return new Promise((resolve, reject) => { 
            var promises = [];
            var allChildren = [];
            urls.forEach((u) => {
                promises.push(crawler.constructNode(u));
            })
            //wait for every promise to resolve
            return Promise.all(promises).then(() => {
                //urls have children by now - add them to a container
                urls.forEach((url) => {
                    url.children.forEach(c => allChildren.push(c));
                });
                //pass all of the children to the next iteration
                resolve(allChildren);
            });
        });
    }

    /**
     * Create a tree, starting from the given url, containing the given number of layers.
     * This function is "thenable".
     * @param url - url to crawl
     * @param layers - the rank of the resulting tree
     * @param path - a path to save the Json file to
     */
    crawl(url: string, layers: number, path: string) {
        return new Promise((resolve, reject) => {
            let crawler: Crawler = new Crawler();
            let mainUrl: Url = new Url(url);
            crawler.constructTree(mainUrl, layers).catch(e => console.log(e)).then(() => {
                this.writeUrlToJson(mainUrl, path);
                resolve(url);
            });
        });
    }
        
}
    //any get request to the root will show the index page(which has a form)
    app.get('/', function(req,res){
        res.sendFile(pathLib.join(__dirname + '/index.html'));  
    });   

    //handles the posted form
    app.post('/', (req, res) => {
        var form = new formidable.IncomingForm();
        form.parse(req, (err,fields,files) => {
            if (err) throw err;
            let crawler: Crawler = new Crawler();
            let urlField: string = fields['url'];
            let layersField: number = fields['layers'];
            //crawl the given url
            crawler.crawl(urlField, layersField, "./result.json")
                .then((url) => res.send("Crawling [" + url + "] is done, check file in the project folder"));       
        });     
    });

app.listen('8081');
exports = module.exports = app;