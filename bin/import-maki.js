// download maki icons, extract svgs

const https = require("https");
const untar = require("tar-stream").extract;
const zlib = require("zlib");
const path = require("path");
const fs = require("fs");

const dest = path.resolve(__dirname,path.join("..","iconsets","icon"));

const maki2shortbread = {
	"alcohol-shop": "alcohol",
	"amusement-park": "theme_park",
	"art-gallery": "arts_centre",
	"bar": "nightclub",
	"beer": "pub",
	"bicycle-share": "bicycle_rental",
	"camp-site": ["camp_site", "caravan_site"],
	"car-rental": ["car_rental","car_sharing"],
	"cemetery": "grave_yard",
	"college": ["college","university"],
	"doctor": "doctors",
	"dog-park": "dog_park",
	"drinking-water": ["drinking_water","water_well"],
	"embassy": ["diplomatic", "embassy"],
	"emergency-phone": "phone",
	"fast-food": "fast_food",
	"fire-station": "fire_station",
	"fitness-centre": "sports_centre",
	"garden-centre": "garden_centre",
	"golf": "golf_course",
	"greengrocer": "grocery",
	"historic": ["archaelogical_site","battlefield","fort","memorial","ruins"],
	"hospital": ["clinic","hospital"],
	"lodging": [ "bed_and_breakfast", "guest_house", "hostel", "hotel", "motel" ],
	"mobile-phone": "mobile_phone",
	"observation-tower": "tower",
	"picnic-site": "picnic_site",
	"place-of-worship": "place_of_worship",
	"post": "post_office",
	"religious-christian": "wayside_cross",
	"restaurant": ["food_court","restaurant"],
	"shop": [ "department_store", "general", "mall", "supermarket" ],
	"swimming": "swimming_pool",
	"toilet": "toilets",
	"town-hall": ["public_building","townhall"],
	"waste-basket": "waste_basket",
};

const extra2shortbread = {
	"atm": "atm",
	"beergarden": "biergarten",
	"bench": "bench",
	"car-wash": "car_wash",
	"chalet": ["chalet","alpine_hut"],
	"community": "community_centre",
	"fountain": "fountain",
	"justice": "courthouse",
	"icerink": "ice_rink",
	"hydrant": "fire_hydrant",
	"shrine": "wayside-shrine",
	"emergency-access": "emergency_access_point",
	"artwork": "artwork",
	"waterworks": "water_works",
	"wastewater": "wastewater_plant",
	"surveillance": "surveillance",
	"drycleaning": "dry_cleaning",
	"travel-agent": "travel_agency",
	"computer": "computer",
	"doityourself": "doityourself",
	"greengrocer": "greengrocer",
	"stationery": "stationery",
	"video": "video",
	"shrine": "wayside_shrine",
	"beauty": "beauty",
	"newsagent": "newsagent",
	"toys": "toys",
	"outdoor": "outdoor",
	"postbox": "post_box",
	"nursinghome": "nursing_home",
	"marketplace": "marketplace",
	"vendingmachine": "vending_machine",
	"huntingstand": "hunting_stand",
	"waterpark": "water_park",
	"shoes": "shoes",
	"beverages": "beverages",
	"butcher": "butcher",
	"kiosk": "kiosk",
	"clothes": "clothes",
	"chemist": "chemist",
	"books": "books",
	"jewelry": "jewelry",
	"sports": "sports",
};

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

				const id = path.basename(filename, ".svg");

				let dests = [ path.join(dest,filename) ];
				if (maki2shortbread.hasOwnProperty(id)) {
					if (Array.isArray(maki2shortbread[id])) {
						maki2shortbread[id].forEach(function(destname){
							dests.push(path.join(dest,destname+".svg"));
						});
					} else {
						dests.push(path.join(dest,maki2shortbread[id]+".svg"));
					}
				}

				Promise.allSettled(dests.map(function(d){
					return new Promise(function(resolve,reject){
						fs.writeFile(d, svg, function(err){
							if (!err) console.log("Imported: %s → %s", filename, path.basename(d));
							resolve();
						});
					});
				})).then(function(){
					next();
				});

			});

		}).on("close", function(){

			// extra icons
			Promise.allSettled(Object.entries(extra2shortbread).reduce(function(jobs,[src,dests]){
				if (!Array.isArray(dests)) dests = [ dests ];

				dests.forEach(function(d){
					jobs.push(new Promise(function(resolve, reject){
						fs.copyFile(
							path.resolve(dest,"../extra",src+".svg"),
							path.resolve(dest,d+".svg"),
							function(err){
								if (!err) console.log("Extra: %s.svg → %s.svg", src, d);
								resolve();
							});
					}));
				});

				return jobs;

			},[])).then(function(){
				console.log("Done.");
			});
		}));
	});
});
