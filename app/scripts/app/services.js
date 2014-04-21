angular.module('Scrape')
.service('Alerts', function(){
	var Alerts = {
		mp3:{
			auction_alert : new Audio('audio/alert.mp3')
		},
		PlayAlert: function(){
			if(!this.mp3.auction_alert.paused) return;
			this.mp3.auction_alert.play();
		}
	}

	return Alerts;
})

.service('ItemsDB', function(){

	var Cache = null;

	var CacheXHR = $.get('/scripts/itemlist.xml').then(function(xml){
		Cache = $($.parseXML(xml));
		return Cache;
	});

	var DB = {
		search_name : function(name){
			return CacheXHR.then(function(data){
				var items = data.find('item[name*="'+name+'"]');
				var result = [];
				items.each(function(index, elem){
					result.push({
						name : $(elem).attr('name'),
						item_id : $(elem).attr('id'),
						stacksize : $(elem).attr('stacksize'),
						qualityid : $(elem).attr('qualityid')
					})
				});
				return result;
			})
		}
	}
	
	return DB;
})

.service('Notification', function(){
	var Notification = {
		notify : function(title, message){

			var notify = webkitNotifications.createNotification(
				'images/icon-128.png',
				title,
				message
		    );

			notify.show();

			setTimeout(function(){
				notify.cancel();
			}, 5000);
		}
	}

	return Notification;
})

.service('Db', function(){
	var Db = {
		getTrackers : function(){
			return JSON.parse(window.localStorage['trackers'] || "[]")
		},
		saveTrackers : function(tracker_arr){
			window.localStorage['trackers'] = JSON.stringify(tracker_arr);
		},

		getHistory : function(){
			var history = JSON.parse(window.localStorage['history'] || "[]");
			return (history instanceof Array ? history : []);
		},

		pushHistory : function(history){
			var history_arr = Db.getHistory();
				history_arr.push(history);
			window.localStorage['history'] = JSON.stringify(history_arr);
		},

		saveHistory : function(history_arr){
			window.localStorage['history'] = JSON.stringify(history_arr);
		},

		historyCount: function(){
			return Db.getHistory().length;
		}
	}

	return Db;
})

.service('API', function($http){
	var Scraper = {
		scrape : {
			sell_items: function(rawhtml){
				var html = $(rawhtml.data.replace(/<img[^>]*>/g,""));
				var table = html.find('#inventory-0');
				var results = {};

				table.find('tbody tr').each(function(index, elem){
					var elem = $(elem);
					results[elem.find('.name a').data('id')] = {
						item_id : elem.find('.name a').data('id'),
						name : elem.find('.name a').text().trim(),
						quantity : elem.find('.quantity').text().trim()
					}
				});

				return {data:results, html:rawhtml.data}
			},

			search_items : function(rawhtml){
				var html = $(rawhtml.data.replace(/<img[^>]*>/g,""));
				var table = html.find('.auction-house table');
				var results = [];

				table.find('tbody tr').each(function(index, elem){
					var elem = $(elem);

					var buyout = {
						gold : elem.find('td.price .price-buyout .icon-gold'),
						silver : elem.find('td.price .price-buyout .icon-silver'),
						copper : elem.find('td.price .price-buyout .icon-copper'),
					}

					var bid = {
						gold : elem.find('td.price .price-bid .icon-gold'),
						silver : elem.find('td.price .price-bid .icon-silver'),
						copper : elem.find('td.price .price-bid .icon-copper'),
					}

					var data = {
						auc_id : elem.attr('id').replace('auction-', ""),
						item : elem.find('td.item a:eq(1)').text(),
						seller : elem.find('td.item a:eq(2)').text(),
						quantity : elem.find('td.quantity').text(),
						quality : elem.find('td.item a:eq(1)').attr('class'),
						price_bid : Common.deformatMoney(
										parseInt(bid.gold.text().replace(/\,/g,"")),
										parseInt(bid.silver.text()),
										parseInt(bid.copper.text())
									),
						price_buyout : Common.deformatMoney(
										parseInt(buyout.gold.text().replace(/\,/g,"")),
										parseInt(buyout.silver.text()),
										parseInt(buyout.copper.text())
									),
						price_per : Common.deformatMoney(
										parseInt(elem.find('td.price .price-tooltip .icon-gold:eq(1)').text().replace(/\,/g,"")),
										parseInt(elem.find('td.price .price-tooltip .icon-silver:eq(1)').text()),
										parseInt(elem.find('td.price .price-tooltip .icon-copper:eq(1)').text())
									),
						price_bid_format : {
							gold : parseInt(bid.gold.text().replace(/\,/g,"")) || '--',
							silver : parseInt(bid.silver.text()) || '--',
							copper : parseInt(bid.copper.text()) || '--',
						},

						price_buyout_format : {
							gold : parseInt(buyout.gold.text().replace(/\,/g,"")) || '--',
							silver : parseInt(buyout.silver.text()) || '--',
							copper : parseInt(buyout.copper.text()) || '--',
						},
						price_buyout_per : {
							gold : parseInt(elem.find('td.price .price-tooltip .icon-gold:eq(1)').text().replace(/\,/g,"")) || '--',
							silver : parseInt(elem.find('td.price .price-tooltip .icon-silver:eq(1)').text()) || '--',
							copper : parseInt(elem.find('td.price .price-tooltip .icon-copper:eq(1)').text()) || '--',
						}
					}

					results.push(data);
				});

				return {data:results, html:rawhtml.data};
			},

			auction_stats : function(rawhtml){
				var html = $(rawhtml.data.replace(/<img[^>]*>/g,""));

				var types = ['active', 'sold', 'ended'];
				var result = {};

				for(i in types){
					var type = types[i];
					var table = html.find('#auctions-'+type+' table');
					var results = [];

					table.find('tbody tr').each(function(index, elem){
						var elem = $(elem);
						var data = {
							auc_id : elem.attr('id').replace('auction-', ""),
							item : elem.find('td.item a:eq(1)').text(),
							quantity : elem.find('td.quantity').text(),
							quality : elem.find('td.item a:eq(1)').attr('class'),
							icon : elem.find('td.item a:eq(0)').css('background-image')
						}

						var buyout = {
							gold : elem.find('td.price .price-buyout .icon-gold'),
							silver : elem.find('td.price .price-buyout .icon-silver'),
							copper : elem.find('td.price .price-buyout .icon-copper'),
						}

						var bid = {
							gold : elem.find('td.price .price-bid .icon-gold'),
							silver : elem.find('td.price .price-bid .icon-silver'),
							copper : elem.find('td.price .price-bid .icon-copper'),
						}

						if(type == 'active'){
							data = $.extend(data, {
								price_bid : Common.deformatMoney(
												parseInt(bid.gold.text().replace(/\,/g,"")),
												parseInt(bid.silver.text()),
												parseInt(bid.copper.text())
											),
								price_buyout : Common.deformatMoney(
												parseInt(buyout.gold.text().replace(/\,/g,"")),
												parseInt(buyout.silver.text()),
												parseInt(buyout.copper.text())
											),
								price_per : Common.deformatMoney(
												parseInt(elem.find('td.price .price-tooltip .icon-gold:eq(1)').text().replace(/\,/g,"")),
												parseInt(elem.find('td.price .price-tooltip .icon-silver:eq(1)').text()),
												parseInt(elem.find('td.price .price-tooltip .icon-copper:eq(1)').text())
											),
								price_bid_format : {
									gold : parseInt(bid.gold.text().replace(/\,/g,"")) || '--',
									silver : parseInt(bid.silver.text()) || '--',
									copper : parseInt(bid.copper.text()) || '--',
								},

								price_buyout_format : {
									gold : parseInt(buyout.gold.text().replace(/\,/g,"")) || '--',
									silver : parseInt(buyout.silver.text()) || '--',
									copper : parseInt(buyout.copper.text()) || '--',
								},
								price_buyout_per : {
									gold : parseInt(elem.find('td.price .price-tooltip .icon-gold:eq(1)').text().replace(/\,/g,"")) || '--',
									silver : parseInt(elem.find('td.price .price-tooltip .icon-silver:eq(1)').text()) || '--',
									copper : parseInt(elem.find('td.price .price-tooltip .icon-copper:eq(1)').text()) || '--',
								}
							})
						}

						if(type == 'sold'){
							var bought_price = parseInt(elem.find('td.price').data('raw'));

							data = $.extend(data, {
								item : elem.find('td.item a').text().trim(),
								quality : elem.find('td.item a').attr('class'),
								buyer : elem.find('td:eq(3) a').text(),
								bought_price : bought_price
							});
						}

						if(type == 'ended'){
							data.quality = elem.find('td.item a').attr('class'),
							data.item = elem.find('td.item a').text().trim();
						}

						results.push(data);



					});

					result[type] = results;
				}

				return {data:result, html:rawhtml.data};
			}
		}
	}

	var API = {
		url : "https://us.battle.net/wow/en/vault/character/auction/alliance/",
		search_url : "http://us.battle.net/wow/en/search/ta",

		getMoney : function(){
			return $.ajax({
				type: "POST",
				url : API.url + "money"
			})
		},

		search_item_by_name : function(name){
			var data = {
				term: name,
				locale:'en_US',
				community:'wow'
			}

			return $http({
			    url: API.search_url, 
			    method: "GET",
			    params: data
			 })
		},

		deposit : function(item_id, duration, quan, stacks, xstoken){
			return $http({
				url: API.url + 'deposit', 
				method: "POST",
				params: {
					item: item_id,
					duration: duration,
					quan: quan,
					stacks: stacks,
					sk: xstoken,
				}
			})
		},

		get_auctions : function(){
			return $http({
			    url: API.url + 'auctions', 
			    method: "GET"
			 })
			.then(Scraper.scrape.auction_stats);
		},

		createAuction : function(auction){
			
			return $http({
				url: API.url + 'createAuction', 
				method: "POST",
				params: auction
			})
		},

		search_auction : function(query){
			
			return $http({
			    url: API.url + 'browse', 
			    method: "GET",
			    params: query
			 })
			.then(Scraper.scrape.search_items);
		},

		buyout : function(query){
			return $http({
			    url: API.url + 'bid', 
			    method: "POST",
			    params: query
			 });
		},

		get_money : function(){
			return $http({
			    url: API.url + 'money', 
			    method: "GET"
			 });
		},

		get_mail : function(){
			return $http({
			    url: API.url + 'mail', 
			    method: "GET"
			 });
		},

		claim_money : function(data){
			return $http({
			    url: API.url + 'takeMoney', 
			    params : data,
			    method: "POST"
			 });
		},

		get_inventory : function(){
			return $http({
			    url: API.url + 'create', 
			    method: "GET"
			 })
			.then(Scraper.scrape.sell_items);
		},

		cancel : function(auc_id, xstoken){
			return $http({
				url: API.url + 'cancel',
				method: "POST",
				params: { auc_id : auc_id, xtoken: xstoken }
			})
		}
	}

	return API;
})
