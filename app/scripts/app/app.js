'use strict';

var root, apii;
angular.module('Scrape',['ui.bootstrap'])

.run(['$rootScope', function($rootScope) {
    $rootScope.safeApply = function(fn) {
        var phase = this.$root.$$phase;
        if (phase == '$apply' || phase == '$digest') {
            if (fn && (typeof(fn) === 'function')) {
                fn();
            }
        } else {
            this.$apply(fn);
        }
    };
}])

.run(function($rootScope, Db, API){

	var search_default = {
		tier1 : -1,
		tier2 : -1,
		tier3 : -1,
		sort : 'unitBuyout',
		reverse : 'false',
		qual : '1',
		minLvl : 0,
		maxLvl : 90
	}

	if(!localStorage['version'] || parseFloat(localStorage['version']) < 0.6 ){
		localStorage['trackers'] = "";
		localStorage['version'] = 0.6;
	}

    $rootScope.root = {

    	tracking : Db.getTrackers(),

    	OpenTrackItemModal : function(){
    		$('#TrackItemModal').modal();
    	},

    	CloseTrackItemModal : function(){
    		$('#TrackItemModal').modal('hide');
    	},

    	ResetTrackItemForm : function(){
    		$rootScope.root.search_item_name = "";
    		$rootScope.root.search_results = [];
    	},
    
    	search_query : $.extend({}, search_default),

    	alert_form_data : {},
    	sell_form_data : {},

    	auto_bought : 0,

    	history_count : 0,

    	history : Db.getHistory(),

    	history_func: function(item) {
		    return item.item_name != undefined;
		},

		auto_buy : false,

		toggle_autobuy: function(){
			$rootScope.root.auto_buy = !$rootScope.root.auto_buy;
		}
    }
    root = $rootScope;
    apii = API;
})

.controller('TrackingCtrl', function($scope, $rootScope, API, Alerts, Db, ItemsDB, $q, Notification, $interval){
	$scope.tracking = this;

	this.play_alert = false;

	this.inventory_interval = $interval(function(){
		$scope.tracking.check_inventory();
	}, 8000);

	var regex = /\{(.*?)id(.*?)guid(.*?)q3(.*?)\}/g;

	this.toggle_autobuy = function(index){
		$rootScope.root.tracking[index].alert_condition.auto_buy = !$rootScope.root.tracking[index].alert_condition.auto_buy;
	}

	this.check_inventory = function(){
		return API.get_inventory()
		.then(function(res){
			res.data = res.data || {};

			for (var i = $rootScope.root.tracking.length - 1; i >= 0; i--) {
				var tracker = $rootScope.root.tracking[i];
				var inventory = res.data[tracker.item_id];

				if(inventory){
					tracker.stock = inventory.quantity || 0;
				}else{
					tracker.stock = 0;
				}
			};

			if(!$rootScope.root.inventory){
				var match = res.html.match(regex);
				$rootScope.root.inventory = {};

				for (var i = 0; i < match.length; i++) {
					var item = match[i];
					var id = item.match(/id: (.*?)\,/)[1].trim();
					var guid = item.match(/guid: '(.*?)'/)[1].trim();
					
					$rootScope.root.inventory[id] = {
						id: id,
						quality: item.match(/quality: (.*?)\,/)[1].trim(),
						name: item.match(/name: \"(.*?)\"\,/)[1].trim(),
						guid : guid,
						q0 : parseInt(item.match(/q0: (.*?)\,/)[1].trim()),
						q1 : parseInt(item.match(/q1: (.*?)\,/)[1].trim()),
						q2 : parseInt(item.match(/q2: (.*?)\,/)[1].trim()),
						q3 : parseInt(item.match(/q3: (.*?)\}/)[1].trim()),
						maxQty : item.match(/maxQty: (.*?)/)[1].trim(),
					}
				};
			}
		})
	}
	$scope.tracking.check_inventory();

	this.auctions_interval = $interval(function(){
		$scope.tracking.get_auctions();
	}, 8000);

	this.get_auctions = function(){
		API.get_auctions()
		.then(function(res){
			$rootScope.root.auctions = res.data;
		})
	}
	$scope.tracking.get_auctions();

	this.interval = setInterval(function(){

		$scope.tracking.play_alert = false;
		$scope.tracking.xhrs = [];

		for (var i = $rootScope.root.tracking.length - 1; i >= 0; i--) {
			var tracker = $rootScope.root.tracking[i];

			var xhr = API.search_auction(tracker.query)
			.then((function(tracker){
				return function(res){
					tracker.results = res.data;

					var xstoken = res.html.match(/var xsToken = '(.*)';/)[1];
					tracker.xstoken = xstoken;

					if(res.data.length == 0) return;

					tracker.item_id = tracker.item.item_id;

					if(tracker.alert_condition){
						for (var rowindex = 0; rowindex < tracker.results.length; rowindex++) {
							var item = tracker.results[rowindex];

							if(item.price_per <= tracker.alert_condition.less_than && item.price_buyout > 0){
								item.alert = true;

								if(tracker.alert_condition.play_sound){
									Alerts.PlayAlert();
								}

								if(tracker.alert_condition.auto_buy && $rootScope.root.auto_buy){
									$scope.tracking.BuyOutWithData(tracker, rowindex);
								}
							}
						};
					}
					
				}
			})(tracker))

			$scope.tracking.xhrs.push(xhr);
		};

		$q.all($scope.tracking.xhrs).then(function(){
			Db.saveTrackers($rootScope.root.tracking);
		})

	}, 2500);

	this.BuyOutWithData = function(tracker, rowindex){
		var data = tracker.results[rowindex];

		API.buyout({
			auc : data.auc_id,
			money : data.price_buyout,
			xtoken : tracker.xstoken
		}).success(function(data){
			if (data.error) {
				toastr.error(data.error.message);
			} else {
				$rootScope.root.auto_bought++;

				toastr.success("Auction Won!");				

				var formatted_gold = Common.formatMoney(data.item.buyout);
				var price_formatted = formatted_gold.gold+"g "+formatted_gold.silver+"s "+formatted_gold.copper+"c";
				var quantity = (data.item.tooltipParams.quantity ? data.item.tooltipParams.quantity : 1);

				$rootScope.root.history.push({
					type : "buy",
					auto_buy : true,
					time : new Date(),
					item_name : data.item.name,
					price : data.item.buyout,
					price_formatted : price_formatted,
					quantity : quantity,
					auc_id : data.item.auctionId
				});

				$rootScope.root.history_count += 1;
				Db.saveHistory($rootScope.root.history);

				Notification.notify("Auction: Item Bought", "["+data.item.name+"] x"+quantity+"\n"+price_formatted);
			}
		});
	}

	this.BuyOut = function(trackindex, rowindex, $event){
		var data = $rootScope.root.tracking[trackindex]['results'][rowindex];

		if(confirm("Buyout Item at " + 
			(data.price_buyout_format.gold == '--' ? 0 : data.price_buyout_format.gold )+"g " +
			(data.price_buyout_format.silver == '--' ? 0 : data.price_buyout_format.silver )+"s " +
			(data.price_buyout_format.copper == '--' ? 0 : data.price_buyout_format.copper )+"c? "
		)){
			API.buyout({
				auc : data.auc_id,
				money : data.price_buyout,
				xtoken : $rootScope.root.tracking[trackindex].xstoken
			}).success(function(data){
				if (data.error) {
					toastr.error(data.error.message);
				} else {
					toastr.success("Auction Won!");

					var formatted_gold = Common.formatMoney(data.item.buyout);
					var price_formatted = formatted_gold.gold+"g "+formatted_gold.silver+"s "+formatted_gold.copper+"c";
					var quantity = (data.item.tooltipParams.quantity ? data.item.tooltipParams.quantity : 1);

					$rootScope.root.history.push({
						type : "buy",
						auto_buy : false,
						time : new Date(),
						item_name : data.item.name,
						price : data.item.buyout,
						price_formatted : price_formatted,
						quantity : quantity,
						auc_id : data.item.auctionId
					});
					
					$rootScope.root.history_count += 1;
					Db.saveHistory($rootScope.root.history);
				}
			});
		}
	}

	this.DeleteTracker = function($index){
		$rootScope.root.tracking.splice($index,1);

		Db.saveTrackers($rootScope.root.tracking);
	}

	this.OpenAlertForm = function(index){
		$rootScope.root.alertform_editing_index = index;
		

		if($rootScope.root.tracking[index]['alert_condition']){
			var price = Common.formatMoney($rootScope.root.tracking[index]['alert_condition']['less_than'])
			$rootScope.root.alert_form_data = {
				gold : price.gold,
				silver : price.silver,
				copper : price.copper,
				play_sound : $rootScope.root.tracking[index]['alert_condition']['play_sound'],
				auto_buy : $rootScope.root.tracking[index]['alert_condition']['auto_buy'],
				show_cancel : true
			}
		}else{
			$rootScope.root.alert_form_data = {}
		}
		$('#AlertModal').modal();
	}

	this.OpenSellForm = function(index){
		$rootScope.root.alertform_editing_index = index;
		
		var tracker = $rootScope.root.tracking[index];
		$rootScope.root.current_modal_tracker = tracker;

		if(tracker.results[0]){
			var buyout_amt = Common.formatMoney((parseInt(tracker.results[0].price_buyout) / parseInt(tracker.results[0].quantity)) - 100);
			var starting_amt = buyout_amt;
		}else{
			var buyout_amt = Common.formatMoney(tracker.last_buyout_price);
			var starting_amt = Common.formatMoney(tracker.last_starting_price);
		}
		
		$rootScope.root.sell_form_data = {
			quantity : 1,
			stack_size : 1,
			price_type : 'perItem',
			starting: {
				gold : starting_amt.gold,
				silver : starting_amt.silver,
				copper : starting_amt.copper
			},
			buyout: {
				gold : buyout_amt.gold,
				silver : buyout_amt.silver,
				copper : buyout_amt.copper
			}
		}

		$rootScope.sellform = {};
		$rootScope.sellform.creating_auction = false;
		$rootScope.sellform.create_progress = 0;
		$rootScope.sellform.total_create = 0;
		$rootScope.sellform.progress_type = 'warning';

		$('#SellModal').modal();
	}
})

.controller('SellFormCtrl', function($scope, $rootScope, API, Db){
	$scope.form = this;

	$rootScope.sellform = {};
	$rootScope.sellform.creating_auction = false;
	$rootScope.sellform.create_progress = 0;
	$rootScope.sellform.total_create = 0;
	$rootScope.sellform.progress_type = 'warning';

	this.Submit = function(){
		var tracker = $rootScope.root.tracking[$rootScope.root.alertform_editing_index];
		API.deposit(tracker.item_id, 1, $rootScope.root.sell_form_data.stack_size, $rootScope.root.sell_form_data.quantity, tracker.xstoken)
		.success(function(res){
			if(res.error){
				toastr.error("Create Failed!");
				return;
			}

			$rootScope.sellform.progress_type = 'warning';
			$rootScope.sellform.creating_auction = true;
			$rootScope.sellform.total_create = $rootScope.root.sell_form_data.quantity;
			$rootScope.sellform.create_progress = 0;
			$scope.form.submit_auction(res.ticket, tracker, $rootScope.sellform.total_create);
		})
	}

	this.submit_auction = function(ticket, tracker, num_stacks){
		var buyout_amt = Common.deformatMoney(
					parseInt($rootScope.root.sell_form_data.buyout.gold || 0),
					parseInt($rootScope.root.sell_form_data.buyout.silver || 0),
					parseInt($rootScope.root.sell_form_data.buyout.copper || 0)
				);
		var starting_amt = Common.deformatMoney(
					parseInt($rootScope.root.sell_form_data.starting.gold || 0),
					parseInt($rootScope.root.sell_form_data.starting.silver || 0),
					parseInt($rootScope.root.sell_form_data.starting.copper || 0)
				);


		var data = {
			itemId     : tracker.item_id,
			quantity   : $rootScope.root.sell_form_data.stack_size,
			duration   : 1,
			stacks     : $rootScope.root.sell_form_data.quantity,
			buyout     : parseInt(buyout_amt) * parseInt($rootScope.root.sell_form_data.stack_size),
			bid        : parseInt(starting_amt) * parseInt($rootScope.root.sell_form_data.stack_size),
			// guid    : $rootScope.root.inventory[tracker.item_id].guid || 0,
			ticket     : ticket,
			xtoken     : tracker.xstoken,
			type       : $rootScope.root.sell_form_data.price_type,
			sourceType : 0
		}


		$rootScope.sellform.create_progress = ((($rootScope.sellform.total_create+1) - num_stacks) * (100/$rootScope.sellform.total_create)) - 10;

		API.createAuction(data).success(function(res){
			if(res.error){
				toastr.error("Create Failed!");
				return;
			}

			tracker.last_buyout_price = buyout_amt;
			tracker.last_starting_price = starting_amt;

			if(num_stacks == 1){
				toastr.success("Auction Created!");
				$('#SellModal').modal('hide');
				$rootScope.sellform.creating_auction = false;
				$rootScope.sellform.create_progress = 100;
				$rootScope.sellform.progress_type = 'success';
			}else{
				if(res.auction && res.auction.nextTicket){
					$scope.form.submit_auction(res.auction.nextTicket, tracker, num_stacks-1);
				}
			}
			
		})
	}
})

.controller('AlertFormCtrl', function($scope, $rootScope, API, Db){
	$scope.form = this;

	this.StopAlert = function(){
		delete $rootScope.root.tracking[$rootScope.root.alertform_editing_index]['alert_condition'];
		$('#AlertModal').modal('hide');
	}

	this.Submit = function(){
		var gold = parseInt($rootScope.root.alert_form_data.gold) || 0;
		var silver = parseInt($rootScope.root.alert_form_data.silver) || 0;
		var copper = parseInt($rootScope.root.alert_form_data.copper) || 0;
		var deformat = Common.deformatMoney(gold, silver, copper);

		if(deformat >= 0){
			$rootScope.root.tracking[$rootScope.root.alertform_editing_index]['alert_condition'] = {
				less_than : deformat,
				play_sound : $rootScope.root.alert_form_data.play_sound,
				auto_buy : $rootScope.root.alert_form_data.auto_buy,
			}

			$rootScope.root.alertform_editing_index = null;
			$('#AlertModal').modal('hide');

			Db.saveTrackers($rootScope.root.tracking);

		}else{
			delete $rootScope.root.tracking[$rootScope.root.alertform_editing_index]['alert_condition'];

			Db.saveTrackers($rootScope.root.tracking);
		}
	}
})

.controller('TrackItemForm', function($scope, $rootScope, API, Db, ItemsDB){
	$scope.form = this;

	this.data = {};
	this.result_choices = [];
	this.chosen_item = null;

	this.search_item = function(){
		ItemsDB.search_name($rootScope.root.search_item_name)
		.then(function(res){
			$rootScope.root.search_results = res;
		})
	}

	this.choose_search_item = function(index){
		var search_query = {
			itemId : $rootScope.root.search_results[index].item_id,
			reverse : false,
			sort : 'unitBuyout'
		}

		var final_query = {
			item : $rootScope.root.search_results[index],
			query : search_query,
			query_url : API.url + 'browse?' + $.param(search_query),
			results : [],
			refresh_in : 5000
		}

		$rootScope.root.tracking.push(final_query);
		$rootScope.root.ResetTrackItemForm();
		$rootScope.root.CloseTrackItemModal();

		var db = Db.getTrackers()
			db.push(final_query);

		Db.saveTrackers(db);
	}

	this.Submit = function(){
		if($rootScope.root.search_results.length == 1){
			$rootScope.root.choose_search_item(0);
		}else{
			toastr.error('Please select an item from the search results.')
		}
	}
})

.controller('ProfileCtrl', function($scope, $rootScope, API, Db, $interval){
	$scope.profile = this;

	this.ClaimMoney = function(){
		API.claim_money({
			mailIds : $scope.profile.mail_sold.join(',')
		})
		.success(function(data){
			if (data.error) {
				toastr.error(data.error.message);
			} else {
				toastr.success("Money Claimed!");
			}
		})

	}

	this.get_money = function(){
		API.get_money()
		.success(function(data){
			if(data.error){
				console.warn(data.error.message);
				return;
			}
			$scope.profile.gold_amount = data.money;
			$scope.profile.gold = Common.formatMoney(data.money);
		})
	}

	this.get_mail = function(){
		API.get_mail()
		.success(function(data){
			if(data.error){
				console.warn(data.error.message);
				return;
			}

			$scope.profile.player = data.character;

			$scope.profile.auction_won = 0;
			$scope.profile.auction_sold = 0;
			$scope.profile.earned_amount = 0;

			$scope.profile.mail_sold = [];

			for (var i = 0; i < data.mail.newMessages.length; i++) {
				var mail = data.mail.newMessages[i];

				if(mail.mailType == "WON"){
					$scope.profile.auction_won++;
				}else if(mail.mailType == "SOLD"){
					$scope.profile.auction_sold++;
					$scope.profile.earned_amount += mail.attachedMoney;
					$scope.profile.mail_sold.push(mail.mailId);
				}
			};

			$scope.profile.earned = Common.formatMoney($scope.profile.earned_amount);
			$scope.profile.total = Common.formatMoney($scope.profile.gold_amount + $scope.profile.earned_amount);
		})
	}

	$scope.profile.get_money();
	$scope.profile.get_mail();

	$interval(function(){
		$scope.profile.get_money();
		$scope.profile.get_mail();
	}, 10000);
})

var Common = {
	formatMoney: function(amount) {
		var gold = Math.floor(amount / 10000);
		var silver = Math.floor((amount - (gold * 10000)) / 100);
		var copper = Math.floor((amount - (gold * 10000)) - (silver * 100));

		if (!silver) silver = 0;
		if (!copper) copper = 0;
		if (!gold) 	 gold = 0;

		return {
			gold: gold,
			silver: silver,
			copper: copper
		};
	},
	deformatMoney : function(gold, silver, copper) {
		gold = Math.round(gold);
		silver = Math.round(silver);
		copper = Math.round(copper);

		var total = (((gold * 100) * 100) + (silver * 100) + (copper * 1));

		if (!total || isNaN(total))
            total = 0;

		return total;
	},
}
