/*

	(The MIT License)

	Copyright (C) 2005-2013 Kai Davenport

	Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

	The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

	THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

 */

/**
 * Module dependencies.
 */
var fs = require('fs');
var async = require('async');
var path = require('path');
var wrench = require('wrench');
var mkdirp = require('mkdirp');
var Client = require('digger-bundle');
var mime = require('mime');
var csv = require('csv');

module.exports = function(config){

	var filestore_path = '/tmp/diggerfilestore';

	var digger_data_folder = process.env['DIGGER_ROOT_DATA_FOLDER'];

	if(fs.existsSync(digger_data_folder)){
		filestore_path = digger_data_folder + '/files';
	}

	if(!fs.existsSync(filestore_path)){
		wrench.mkdirSyncRecursive(filestore_path, 0777);
	}

  function copyFile(source, target, cb) {
    var cbCalled = false;

    var rd = fs.createReadStream(source);
    rd.on("error", function(err) {
      done(err);
    });
    var wr = fs.createWriteStream(target);
    wr.on("error", function(err) {
      done(err);
    });
    wr.on("close", function(ex) {
      done();
    });
    rd.pipe(wr);

    function done(err) {
      if (!cbCalled) {
        cb(err);
        cbCalled = true;
      }
    }
  }

	function ensure_folder(path, done){
		mkdirp(path, 0777, done);
	}


  var import_processors = {
    csv:function(localfile, done){
      fs.readFile(localfile, 'utf8', function(error, st){
        csv()
        .from.string(st)
        .to.array( function(data){
          
          var fields = data[0];
          data.shift();

          fields.map(function(field){
            return field.replace(/\s+/g, '_').replace(/\W/g, '');
          })

          var models = data.map(function(row){
            var model = {};

            fields.forEach(function(field, index){
              model[field] = row[index];
            })

            return model;
          })

          done(null, {
            type:'csv',
            fields:fields,
            models:models
          });
        });
      })
    },
    json:function(localfile, done){
      fs.readFile(localfile, 'utf8', function(error, st){
        // assume that there is 1 model per line
        if(st.indexOf('{')==0){
          var lines = st.split(/\n/);
          var models = lines.map(function(line){
            return JSON.parse(line);
          })

          done(null, models);
        }
        else{
          var models = JSON.parse(st);

          done(null, {
            type:'json',
            models:models
          });
        }
      })
    }
  }

  var image_formats = {
    jpg:true,
    jpeg:true,
    gif:true,
    png:true
  }

  return {

    /*
    
      turns a file into container data
      
    */
    import:function(from, filename, warehouse, done){
      var self = this;
      var extmatch = filename.match(/\.(\w+)$/);

      if(!extmatch){
        done('no file extension found');
        return;
      }

      var ext = extmatch[1].toLowerCase();

      function upload_single_file(tag){
        var container = Client.Container(tag, {
          name:filename,
          ext:ext,
          mimetype:mime.lookup(ext)
        }).addClass(ext);

        var url = warehouse + '/' + container.diggerid() + '/' + filename;

        container.attr('src', url);

        var data = container.toJSON();
        self.upload(from, url, function(error){
          if(error){
            done(error);
            return;
          }
          done(null, {
            type:'file',
            models:data
          });
        })
      }

      // image file
      if(image_formats[ext]){
        upload_single_file('img');
      }
      // process file
      else if(import_processors[ext]){
        var fn = import_processors[ext];

        fn(from, function(error, data){
          if(error){
            done(error);
          }
          else{
            done(null, data);
          }
        })
      }
      // normal file
      else{
        upload_single_file('file');
      }
    },
    upload:function(from, to, done){
      var parts = to.split('/');
      var filename = parts.pop();
      var folder = parts.join('/');
      ensure_folder(filestore_path + folder, function(error){
        copyFile(from, filestore_path + to, done);

      })
    },
    serve:function(req, res){
      var method = req.method.toLowerCase();

      if(method=='get'){
        fs.stat(filestore_path + unescape(req.url), function(error, stat){
          if(error || !stat){
            res.statusCode = 404;
            res.send(req.url + ' not found');
          }
          else if(stat.isDirectory()){
            res.send('');
          }
          else{
            res.sendfile(filestore_path + req.url);
          }
        })
      }
      else{
        if(req.url.match(/\.\w+$/)){
          var parts = req.url.split('/');
          var filename = parts.pop();
          var folder = parts.join('/');
          var fullpath = folder + '/' + filename;
          ensure_folder(folder, function(error){
            if(error){
              res.statusCode = 500;
              res.send(error);
            }
            else{
              var stream = fs.createWriteStream(fullpath);
              req.on('end', function(){
                res.send('ok');
              })
              req.pipe(stream);
            }
          })
        }
        else{
          res.statusCode = 500;
          res.send('cannot post to a directory');
        }
        
      }
    }
  }
  
}