// download maki icons, extract svgs

const https = require("https");
const untar = require("tar-stream").extract;
const zlib = require("zlib");
const path = require("path");
const fs = require("fs");

const dest = path.resolve(__dirname,path.join("..","iconsets","icon"));

// simple https client with redirects
function get(url, fn){
	https.get(url, function(res){
		if (res.headers.location) return get(res.headers.location, fn);
		if (res.statusCode !== 200) return fn(new Error("Unexpected Status Code: "+res.statusCode));
		if (res.headers["content-type"] !== "application/x-gzip") return fn(new Error("Unexpected Content-type: "+res.header["content-type"]));
		fn(null, res);
	});
};

// ensure dest dir
fs.mkdir(dest, { recursive: true }, function(){

	// https request
	get("https://github.com/mapbox/maki/tarball/main", function(err, res){
		if (err) return console.error(err);
		res.pipe(zlib.createGunzip()).pipe(untar().on("entry", function(header, stream, next){

			if (header.type !== "file") return stream.resume(), next();
			let bits = header.name.split("/");
			let filename = bits.pop();
			let dir = bits.pop();

			// keep license
			if (filename === "LICENSE.txt") return stream.pipe(fs.createWriteStream(path.join(dest,filename)).on("close", function(){
				console.log("Saved: %s", filename);
				next()
			}));

			if (dir !== "icons") return stream.resume(), next();

			const chunks = []
			stream.on("data", function(chunk){
				chunks.push(chunk);
			}).on("end", function(){
				let svg = Buffer.concat(chunks);

				// scale icons ×12 for better scaling with sharp, add license metadata
				svg = Buffer.from(svg.toString().replace(/<svg([^>]*)width="([0-9]+)"([^>]*)>/, function(all, before, w, after){
					return '<svg'+before+'width="'+(parseInt(w,10)*12)+'"'+after+'>';
				}).replace(/<svg([^>]*)height="([0-9]+)"([^>]*)>/, function(all, before, h, after){
					return '<svg'+before+'height="'+(parseInt(h,10)*12)+'"'+after+'>';
				}));

				// save
				fs.writeFile(path.join(dest,filename), svg, function(err){
					if (!err) console.log("Imported: %s", filename);
					next();
				});
			});

		}).on("end", function(){
			console.log("Done.");
		}));
	});
});
