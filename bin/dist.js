const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const tar = require("tar-stream");

const srcdir = path.resolve(__dirname, "../sprites");
const destdir = path.resolve(__dirname, "../dist");

fs.mkdir(destdir, { recursive: true }, function(err){
	if (err) return console.error("Could not create dir '%s': %s", destdir, err);
	fs.readdir(srcdir, async function(err, files){
		if (err) return console.error("Could not read dir '%s': %s", srcdir, err);

		const pack = new tar.pack();

		pack.pipe(zlib.createGzip()).pipe(fs.createWriteStream(path.join(destdir,"sprites.tar.gz")).on("close", function(){
			console.log("Done.");
		}));

		const queue = files.filter(function(file){
			return (file.slice(-4) === ".png" || file.slice(-5) === ".json");
		}).map(function(file){
			return function(resolve,reject){

				const filepath = path.join(srcdir, file);

				fs.stat(filepath, function(err, stats){
					if (err) return reject(err);

					const entry = pack.entry({ name: path.join("sprites", file), size: stats.size }, function(err) {
						console.log("packed %s", file);
						if (err) return reject(err);
						resolve();
					});

					fs.createReadStream(filepath).pipe(entry);

				});

			};

		});

		for (const fn of queue) await new Promise(fn);

		pack.finalize();

	});
});

