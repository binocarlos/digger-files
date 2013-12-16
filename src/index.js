/*

	(The MIT License)

	Copyright (C) 2005-2013 Kai Davenport

	Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

	The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

	THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

 */

/*
  Module dependencies.
*/

var express = require('express');
var FileStore = require('./filestore');
var EventEmitter = require('events').EventEmitter;

// generate a middleware connector for the JavaScript api
module.exports = function(config){
	var self = this;

	var fileapp = express();
  var filestore = FileStore(config);

  /*
  
    checks whether the current request is able to 'get' | 'post' to the warehouse
    represented by the filepath (/reception/files as been stripped)

    the URL format is /reception/files/warehouseurl/containerid/fieldname.extension
    
  */
  function check_warehouse_access(user, warehouseurl, method, done){
    // we run a request back to the warehouseurl + /ping to check we are allowed through
    var req = {
      method:method.toLowerCase(),
      url:warehouseurl + '/ping',
      headers:{
        'x-json-user':user
      }
    }

    fileapp.emit('check_access', req, function(error, answer){
      if(error){
        done(error);
        return;
      }
      
      done(null, answer && answer.length>0);
    })
  }

  /*
  
    the file form uploader (where the file is a parameter not the raw body)
    
  */
  fileapp.post('/upload', function(req, res, next){
    var file = req.files.file;

    if(file){
      var warehousepath = req.body.warehouse;
      var container = req.body.containerid;
      var auth = req.session.auth || {};
      var user = auth.user;
      
      var url = warehousepath + '/' + container + '/' + file.name;

      check_warehouse_access(user, warehousepath, 'post', function(error){
        filestore.upload(file.path, url, function(error){
          if(error){
            res.statusCode = 500;
            res.send(error);
            return;
          }

          res.send(url);
        })
      })      
    }
    else{
      res.statusCode = 500;
      res.send('no file uploaded');
    }
  })


  /*
  
    the file importer - we generate container data from the upload

    the container data is then appended by the GUI

    if the upload is an actual file then we save it and stick the reference into the returned container data
    
  */
  fileapp.post('/import', function(req, res, next){
    var file = req.files.file;

    if(file){

      var warehousepath = req.body.warehouse;
      var auth = req.session.auth || {};
      var user = auth.user;
      
      check_warehouse_access(user, warehousepath, 'post', function(error){
        filestore.import(file.path, file.name, warehousepath, function(error, data){
          if(error){
            res.statusCode = 500;
            res.send(error);
            return;
          }

          res.send(data);
        })
      })   
    }
    else{
      res.statusCode = 500;
      res.send('no file uploaded');
    }
  })


  /*
  
    the filestore

    the URL format is /reception/files/warehouseurl/containerid/fieldname.extension
    
  */
  fileapp.use(function(req, res, next){

    var auth = req.session.auth || {};
    var user = auth.user;

    check_warehouse_access(user, req.url, req.method, function(error, status){
      if(error){
        res.statusCode = 500;
        res.send(error);
        return;
      }

      if(!status){
        res.statusCode = 404;
        res.send(req.url + ' not found');
      }
      else{
        filestore.serve(req, res);
      }
    })
    

    
  })


  return fileapp;
}