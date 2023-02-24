const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const pack = require("bin-pack");

const config = require("../config.json");

const destdir = path.resolve(__dirname, "../sprites");
const srcdir = path.resolve(__dirname, "../iconsets");

// load svg sources
function load(dir){
	return new Promise(function(resolve, reject){
		fs.readdir(dir, function(err, list){
			if (err) return reject(err);
			Promise.all(list.filter(function(filename){
				return filename.slice(-4) === ".svg";
			}).map(function(filename){
				return new Promise(function(resolve, reject) {
					let filepath = path.resolve(dir, filename);
					let id = filename.slice(0,-4);
					fs.readFile(filepath, function(err, buffer){
						if (err) return reject(err);
						resolve({ id, buffer: stripSVG(buffer) });
					});
				});
			})).then(resolve).catch(reject);
		});
	});
};

// ensure path tags only contain path information, with regex surgery
function stripSVG(buf){
	return Buffer.from(buf.toString().replace(/<path([^>]*) d="([^"]+)"([^>]*)\/>/g,'<path d="$2"/>'));
};

// apply colors to svg paths, with regex surgery
function applyColors(buf, colors){
	let i = 0;
	return Buffer.from(buf.toString().replace(/<path\s/g, function(){
		return '<path fill="'+(colors[i++%colors.length])+'" ';
	}));
};

// "resize" by changing width and height in the svg element, with regex surgery
function applySize(buf, h){

	buf = buf.toString();

	// get current size
	const width = (/<svg[^>]+width="([^"]+)"/.test(buf)) ? parseFloat(RegExp.$1) : null;
	const height = (/<svg[^>]+height="([^"]+)"/.test(buf)) ? parseFloat(RegExp.$1) : null;

	if (!width || !height) return Buffer.from(buf); // FIXME proper error handling, though this shouldnt happen

	const w = (width/height)*h;

	return {
		w, h, // include dimension
		buffer: Buffer.from(buf.replace(/<svg([^>]*)width="([^"]+)"([^>]*)>/, function(all, before, content, after){
			return '<svg'+before+'width="'+(w)+'"'+after+'>';
		}).replace(/<svg([^>]*)height="([^"]+)"([^>]*)>/, function(all, before, content, after){
			return '<svg'+before+'height="'+(h)+'"'+after+'>';
		})),
	};

};

async function main(){

	// load icons
	let icons = await Promise.all(Object.entries(config.sets).map(function([ id, set ]){
		return new Promise(async function(resolve, reject){
			resolve({
				set: id,
				files: await load(path.resolve(srcdir,id)).catch(reject),
			});
		});
	})).catch(function(err){
		console.error(err);
		process.exit(1);
	});

	// merge iconsets
	icons = icons.map(function(iconset){
		return iconset.files.map(function(file){
			file.set = iconset.set;
			return file;
		})
	}).reduce(function(icons, files){
		return [ ...icons, ...files ];
	},[]);

	// apply colors
	icons = icons.reduce(function(icons, icon){
		config.themes.forEach(function(theme){
			let colors = config.sets[icon.set].colors;

			icons.push({
				...icon,
				theme,
				buffer: applyColors(icon.buffer, colors[icon.id] ? colors[icon.id][theme] : colors["*"][theme]),
			});
		});
		return icons;
	},[]);

	// apply sizes
	icons = icons.reduce(function(icons, icon){
		config.sets[icon.set].sizes.forEach(function(size){
			icons.push({
				...icon,
				size,
				name: [ icon.set, icon.theme, icon.id, size ].join("-"),
				...applySize(icon.buffer, size),
			});
		});
		return icons;
	},[]);

	// create spritemap for each ratio
	Object.entries(config.ratio).forEach(function([ scale, factor ]){

		let sprites = icons.map(function(icon){
			icon = structuredClone(icon);
			return {
				...icon,
				...applySize(Buffer.from(icon.buffer), icon.h * factor)
			};
		}).map(function(icon){ // apply 1px buffer, assemble name

			return {
				...icon,
				width: Math.ceil(icon.w)+(4*factor),
				height: Math.ceil(icon.h)+(4*factor),
			};
		});

		// pack
		const dimensions = pack(sprites, { inPlace: true });

		// combine into sprite
		sharp({
			create: {
				width: dimensions.width+(4*factor),
				height: dimensions.height+(4*factor),
				channels: 4,
				background: { r: 0, g: 0, b: 0, alpha: 0 }
			}
		}).composite(sprites.filter(function(sprite){
			return config.sets[sprite.set].glow;
		}).map(function(sprite){ // apply glow
			return {
				input: applyColors(stripSVG(sprite.buffer), [ config.sets[sprite.set].glow[sprite.theme] ]),
				top: sprite.y+(2*factor),
				left: sprite.x+(2*factor)
			};
		}))
		.png()
		.toBuffer(function(err, buf){

			let nsprites = 0;

			sharp(buf)
			.blur(1*factor)
			.composite(sprites.map(function(sprite){
				nsprites++;
				return {
					input: sprite.buffer,
					top: sprite.y+(2*factor),
					left: sprite.x+(2*factor)
				};
			}))
			.png()
			.toBuffer(function(err, buf){
				if (err) return console.error(err);

				// assemble json
				const metadata = sprites.reduce(function(sprites, sprite){

					// if glow
					if (config.sets[sprite.set].glow) {
						sprites[sprite.name] = {
							"width": Math.ceil(sprite.w+(2*factor)),
							"height": Math.ceil(sprite.h+(2*factor)),
							"x": sprite.x+(1*factor),
							"y": sprite.y+(1*factor),
							"pixelRatio": factor
						};
					} else {
						sprites[sprite.name] = {
							"width": Math.ceil(sprite.w),
							"height": Math.ceil(sprite.h),
							"x": sprite.x+(2*factor),
							"y": sprite.y+(2*factor),
							"pixelRatio": factor
						};
					}

					return sprites;
				},{});

				// write to disk
				fs.writeFile(path.join(destdir, "sprites"+scale+".png"), buf, function(){
					if (err) throw err;
					console.log("saved sprites%s.png, %d sprites", scale, nsprites);
				});

				fs.writeFile(path.join(destdir, "sprites"+scale+".json"), JSON.stringify(metadata,null,"\t"), function(err){
					if (err) throw err;
					console.log("saved sprites%s.json, %d entries", scale, Object.keys(metadata).length);
				});
			});
		});

	});

};

main();
