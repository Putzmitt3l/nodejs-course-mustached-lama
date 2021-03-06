'use strict';
var rootConfig = require('../config');
var requestMod = require('request');
var apiCalls = require('./api-calls');
var localStorage = require('../localStorage.js');

var lastNewItemId = localStorage.maxItem;
var newItemsRange = null;
var buffer = null;

function mainLoop () {
    setTimeout(function () {
        processItems();
    }, 3000);
};
mainLoop();

function processItems () {
    //set up localStorage and then start the loop
    init(afterSetup);

    // if for some reason our newItemsRange hasn't change try to check for changes
    // after 3 seconds
    mainLoop();
}

function init (callback) {
    apiCalls.getMaxItem(function setMaxItem(error, response, body) {
        body = parseInt(body);

        if(lastNewItemId === null) {
            lastNewItemId = body;
        }
        else {
            localStorage.storeInLocal('maxItem', body);
            newItemsRange = createNewItemsRange(lastNewItemId, body);
            lastNewItemId = body;
        }
        callback();
    });
}

function afterSetup () {
    if(!!newItemsRange && newItemsRange.length !== 0) { // if we have new entries, iterate through them
        if(!buffer) {
            buffer = [];
        }
        var rangeLength = newItemsRange.length;
        // asyncLoopWithObject(rangeLength, iterationFunction, loopEndCallback);
        asyncLoop(0, rangeLength, iteration, loopEndCallback);
    }
}

function asyncLoop (currentIndex, endIndex, iterrationCallback, doneCallback) {
    if(currentIndex === endIndex) {
        return doneCallback();
    }
    iterrationCallback(currentIndex, function () {
        asyncLoop(++currentIndex, endIndex, iterrationCallback, doneCallback);
    });
}

function iteration (index, callback) {
    if(!!newItemsRange && !!newItemsRange[index]) {
        apiCalls.getArticle(newItemsRange[index], function processArticle (err, response, body) {
            buffer.push(JSON.parse(body));
            console.log('processed item: ' + body);
            callback();
        });
    }
}

function loopEndCallback () {
    // load articles in DB
    localStorage.storeInLocal('items', buffer);
    console.log('stored buffer: ' + JSON.stringify(buffer));
    // clearing buffer
    buffer = null;
    newItemsRange = null;

    // send post request to notify-server so he can process new data
    sendSignalToNotifier();

    // listen for new changes from the API again
    mainLoop();
}

function sendSignalToNotifier () {
    requestMod({
        uri: rootConfig.notifierUrl + rootConfig.notifierUpdateUrl,
        method: "GET",
    }, function (error, response, body) {
        if(error) {
            console.log(error);
        }
        else {
            console.log('notifier notified');
        }
    });
}

function createNewItemsRange (lastItemId, newItemId) {
    var result = [];
    var start = parseInt(lastItemId);
    var end = parseInt(newItemId);

    for (var i = start; i < end; i++) {
        result.push(i);
    }
    return result;
}


//////////////////////////////////////////////
// ASYNC LOOP WITH OBJECT Func Realisations //
//////////////////////////////////////////////

/**
 * Asynchronous loop function for iterably executing asynchronous functions
 * @param  {int}   iterations how many cycles there are in the loop
 * @param  {Function}   func       the asynchronous function, takes a 'loop' parameter
 *                                 (a deffered object for asynchrous controlling, which has
 *                                  a 'next' method called every iterration after async function is executed)
 * @param  {Function} callback   function that executes always at the end of the loop
 * @return {[type]}              [description]
 */
function asyncLoopWithObject (iterations, func, callback) {
    var index = 0;
    var done = false;
    var loop = {
        next: function () {
            if(done) {
                return;
            }
            if(index < iterations) {
                func(loop);
                index++;
            }
            else {
                done = true;
                callback();
            }
        },
        iterration: function () {
            return index;
        },
        break: function () {
            done = true;
            callback();
        }
    };
    loop.next();
    return loop;
}


function iterationFunction (loop) {
    // prep articles for insertion
    var index = loop.iterration();
    if(!!newItemsRange && !!newItemsRange[index]) {
        apiCalls.getArticle(newItemsRange[index], function processArticle (err, response, body) {
            buffer[ newItemsRange[index] ] = JSON.parse(body);
            console.log('processed article: ' + body);
            // important: must be in the callback
            // next iteration
            loop.next();
        });
    }
}
