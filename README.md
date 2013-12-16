digger-files
============

A module to serve file uploads for an express server.

## example

```js
var express = require('express');
var Files = require('digger-files');

var filehandler = Files({
	document_root:'/my/folder'
})

// false check access function
filehandler.on('check_access', function(req, res){
	res.send(null, [{
		_digger:{
			tag:'ok'
		}
	}])
})

var app = express();
app.use('/filestore', filehandler);
```

## install

```
$ npm install digger-files
```

## licence

MIT
