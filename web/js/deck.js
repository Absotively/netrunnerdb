var InputByTitle = false;
var Snapshots = []; // deck contents autosaved
var Autosave_timer = null;
var Deck_changed_since_last_autosave = false;
var Autosave_running = false;
var Autosave_period = 60;

function update_max_qty() {

    NRDB.data.cards.find().forEach(function(card) {
        var modifiedCard = get_mwl_modified_card(card);
        var max_qty = modifiedCard.deck_limit;
        if(card.pack_code == 'core' || card.pack_code == 'core2') {
            max_qty = Math.min(card.quantity * NRDB.settings.getItem('core-sets'), max_qty);
        }
        if(Identity.pack_code == "draft") {
            max_qty = 9;
        }
        NRDB.data.cards.updateById(card.code, {
            maxqty : max_qty
        });
    });

}

Promise.all([NRDB.data.promise, NRDB.settings.promise]).then(function() {
	
	NRDB.data.cards.remove({
		side_code : {
			"$ne" : Side
		}
	});
	
	NRDB.data.cards.find().forEach(function(card) {
		var indeck = 0;
		if (Deck[card.code]) {
			indeck = parseInt(Deck[card.code], 10);
		}
		NRDB.data.cards.updateById(card.code, {
			indeck : indeck,
			factioncost : card.faction_cost || 0
		});
	});
	
	find_identity();
	
	NRDB.draw_simulator.init();
	update_max_qty();

	$('#faction_code').empty();
	
	var factions = NRDB.data.factions.find({side_code: Side}).sort(function(a, b) {
		return b.code.substr(0,7) === "neutral" 
			? -1
			: a.code.substr(0,7) === "neutral" 
				? 1 
				: a.code.localeCompare(b.code);
	});
	factions.forEach(function(faction) {
		var label = $('<label class="btn btn-default btn-sm" data-code="' + faction.code
				+ '" title="'+faction.name+'"><input type="checkbox" name="' + faction.code
				+ '"><img src="'
				+ Url_FactionImage.replace('xxx', faction.code)
				+ '" style="height:12px" alt="'+faction.code+'"></label>');
		label.tooltip({container: 'body'});
		$('#faction_code').append(label);
	});
	
	$('#faction_code').button();
	$('#faction_code').children('label[data-code='+Identity.faction_code+']').each(function(index, elt) {
		$(elt).button('toggle');
	});

	$('#type_code').empty();
	var types = NRDB.data.types.find({
		is_subtype:false,
		'$or': [{
			side_code: Identity.side_code
		},{
			side_code: null
		}]
	}).sort();
	types.forEach(function(type) {
		var label = $('<label class="btn btn-default btn-sm" data-code="'
				+ type.code + '" title="'+type.name+'"><input type="checkbox" name="' + type.code
				+ '"><img src="' + Url_TypeImage.replace('xxx', type.code)
				+ '" style="height:12px" alt="'+type.code+'"></label>');
		label.tooltip({container: 'body'});
		$('#type_code').append(label);
	});
	$('#type_code').button();
	$('#type_code').children('label:first-child').each(function(index, elt) {
		$(elt).button('toggle');
	});
	

	$('input[name=Identity]').prop("checked", false);
	if (Identity.code == "03002") {
		$('input[name=Jinteki]').prop("checked", false);
	}
		

	function findMatches(q, cb) {
		if(q.match(/^\w:/)) return;
		var regexp = new RegExp(q, 'i');
		cb(NRDB.data.cards.find({title: regexp, pack_code: Filters.pack_code || []}));
	}

	$('#filter-text').typeahead({
		  hint: true,
		  highlight: true,
		  minLength: 2
		},{
		displayKey: 'title',
		source: findMatches
	});

	make_cost_graph();
	make_strength_graph();

	$.each(History, function (index, snapshot) {
		add_snapshot(snapshot);
	});

	$('html,body').css('height', 'auto');

	$(document).on('persistence:change', function (event, value) {
		switch($(event.target).attr('name')) {
		case 'core-sets':
			update_core_sets();
		case 'display-columns':
		case 'show-disabled':
		case 'only-deck':
			refresh_collection();
			break;
		case 'show-suggestions':
			NRDB.suggestions.show();
			break;
		case 'sort-order':
			DisplaySort = value;
		case 'show-onesies':
		case 'show-cacherefresh':
			update_deck();
			break;
		}
	});

	var initialPackSelection = {};
	var promises = [];
	
	NRDB.data.packs.find().forEach(function (pack) {
		 promises.push(localforage.getItem('pack_code_'+ pack.code).then(function (value) {
			 if(value) initialPackSelection[pack.code] = (value === "on");
		 }));
	});

	Promise.all(promises).then(function () {
		create_collection_tab(initialPackSelection);
	});
	
});

function create_collection_tab(initialPackSelection) {
	

	var sets_in_deck = {};
	NRDB.data.cards.find({indeck:{'$gt':0}}).forEach(function(card) {
		sets_in_deck[card.pack_code] = 1;
	});
	
	$('#pack_code').empty();
	var f = function(pack, $container) {
		var is_checked = (pack.date_release || sets_in_deck[pack.code]) && initialPackSelection[pack.code] !== false;
		return $container.addClass("checkbox").append('<label><input type="checkbox" name="' + pack.code + '"' + (is_checked ? ' checked="checked"' : '')+ '>' + pack.name + '</label>');
	};
	_.sortBy(NRDB.data.cycles.find(), 'position').forEach(function (cycle) {
		var packs = _.sortBy(NRDB.data.packs.find({cycle_code:cycle.code}), 'position');
		if(cycle.size === 1) {
			if(packs.length) {
				var $div = f(packs[0], $('<div></div>'));
				$('#pack_code').append($div);
			}
		} else {
			var $list = $('<ul class="checkbox checklist-items"></ul>');
			packs.forEach(function (pack) {
				var $li = f(pack, $('<li></li>'));
				$list.append($li);
			});

			var $group = $('<div class="checkbox"></div>');
			var $toggle = $('<div class="checkbox" data-toggle="checklist"><label><input type="checkbox">' + cycle.name + '</label></div>');
			$group.append($toggle);
			$group.append($list);
			$('#pack_code').append($group);
			$toggle.checklist();
		}
	});

	$('.filter').each(function(index, div) {
		var columnName = $(div).attr('id');
		var arr = [];
		$(div).find("input[type=checkbox]").each(function(index, elt) {
			var name = $(elt).attr('name');
			if(!name) return;
			if($(elt).prop('checked')) {
				arr.push(name);
			}
		});
		Filters[columnName] = arr;
	});
	
	FilterQuery = get_filter_query(Filters);

	$('#mwl_code').trigger('change');
	// triggers a refresh_collection();
	// triggers a update_deck();
        
        NRDB.suggestions.query(Side);
}

function get_filter_query(Filters) {
	var FilterQuery = _.pickBy(Filters);

	return FilterQuery;
}

function uncheck_all_others() {
	$(this).closest(".filter").find("input[type=checkbox]").prop("checked",false);
	$(this).children('input[type=checkbox]').prop("checked", true).trigger('change');
}

function check_all_others() {
	$(this).closest(".filter").find("input[type=checkbox]").prop("checked",true);
	$(this).children('input[type=checkbox]').prop("checked", false);
}

function uncheck_all_active() {
	$(this).closest(".filter").find("label.active").button('toggle');
}

function check_all_inactive() {
	$(this).closest(".filter").find("label:not(.active)").button('toggle');
}

$(function() {
	// while editing a deck, we don't want to leave the page if the deck is unsaved
	$(window).on('beforeunload', alert_if_unsaved);
	
	$('html,body').css('height', '100%');

	$('#filter-text').on('typeahead:selected typeahead:autocompleted',
			NRDB.card_modal.typeahead);

	$(document).on('hidden.bs.modal', function (event) {
		if(InputByTitle) {
			setTimeout(function () {
				$('#filter-text').typeahead('val', '').focus();
			}, 100);
		}
	});

	$('#pack_code,.search-buttons').on('change', 'label', handle_input_change);
	
	$('.search-buttons').on('click', 'label', function(event) {
		var dropdown = $(this).closest('ul').hasClass('dropdown-menu');
		if (dropdown) {
			if (event.shiftKey) {
				if (!event.altKey) {
					uncheck_all_others.call(this);
				} else {
					check_all_others.call(this);
				}
			}
			event.stopPropagation();
		} else {
			if (!event.shiftKey && NRDB.settings.getItem('buttons-behavior') === 'exclusive' || event.shiftKey && NRDB.settings.getItem('buttons-behavior') === 'cumulative') {
				if (!event.altKey) {
					uncheck_all_active.call(this);
				} else {
					check_all_inactive.call(this);
				}
			}
		}
	});

	$('#filter-text').on({
		input : function (event) {
			var q = $(this).val();
			if(q.match(/^\w[:<>!]/)) NRDB.smart_filter.handler(q, refresh_collection);
			else NRDB.smart_filter.handler('', refresh_collection);
		}
	});

	$('#save_form').submit(handle_submit);

	$('#btn-save-as-copy').on('click', function(event) {
		$('#deck-save-as-copy').val(1);
	});
	
	$('#btn-cancel-edits').on('click', function(event) {
		var edits = $.grep(Snapshots, function (snapshot) {
			return snapshot.saved === false;
		});
		if(edits.length) {
			var confirmation = confirm("This operation will revert the changes made to the deck since "+edits[edits.length-1].date_creation.calendar()+". The last "+(edits.length > 1 ? edits.length+" edits" : "edit")+" will be lost. Do you confirm?");
			if(!confirmation) return false;
		}
		$('#deck-cancel-edits').val(1);
	});
	
	$('#collection').on({
		change : function(event) {
			InputByTitle = false;
			handle_quantity_change.call(this, event);
		}
	}, 'input[type=radio]');

	$('#collection').on({
		click : function(event) {
			InputByTitle = false;
		}
	}, 'a.card');
	
	$('.modal').on({
		change : handle_quantity_change
	}, 'input[type=radio]');

	$('thead').on({
		click : handle_header_click
	}, 'a[data-sort]');
	
	$('#cardModal').on({
		keypress : function(event) {
			var num = parseInt(event.which, 10) - 48;
			$('.modal input[type=radio][value=' + num + ']').trigger('change');
		}
	});

	var converter = new Markdown.Converter();
	$('#description').on('keyup', function() {
		$('#description-preview').html(
				converter.makeHtml($('#description').val()));
	});

	$('#description').textcomplete([{
		match : /\B#([\-+\w]*)$/,
		search : function(term, callback) {
			var regexp = new RegExp('\\b' + term, 'i');
			callback(NRDB.data.cards.find({
				title : regexp
			}));
		},
		template : function(value) {
			return value.title;
		},
		replace : function(value) {
			return '[' + value.title + ']('
					+ Routing.generate('cards_zoom', {card_code:value.code})
					+ ')';
		},
		index : 1
	}, {
		match : /\$([\-+\w]*)$/,
		search : function(term, callback) {
			var regexp = new RegExp('^' + term);
			callback($.grep(['credit', 'recurring-credit', 'click', 'link', 'trash', 'subroutine', 'mu', '1mu', '2mu', '3mu',
				'anarch', 'criminal', 'shaper', 'haas-bioroid', 'weyland-consortium', 'jinteki', 'nbn'],
				function(symbol) { return regexp.test(symbol); }
			));
		},
		template : function(value) {
			return value;
		},
		replace : function(value) {
			return '<span class="icon icon-' + value + '"></span>';
		},
		index : 1
	}]);
	$('#mwl_code').on('change', update_mwl);
	$('#tbody-history').on('click', 'a[role=button]', load_snapshot);
	setInterval(autosave_interval, 1000);
});
function autosave_interval() {
	if(Autosave_running) return;
	if(Autosave_timer < 0 && Deck_id) Autosave_timer = Autosave_period;
	if(Autosave_timer === 0) {
		deck_autosave();
	}
	Autosave_timer--;
}
// if diff is undefined, consider it is the content at load
function add_snapshot(snapshot) {
	snapshot.date_creation = snapshot.date_creation ? moment(snapshot.date_creation) : moment();
	Snapshots.push(snapshot);

	var list = [];
	if(snapshot.variation) {
		$.each(snapshot.variation[0], function (code, qty) {
			var card = NRDB.data.cards.findById(code);
			if(!card) return;
			list.push('+'+qty+' '+'<a href="'+Routing.generate('cards_zoom',{card_code:code})+'" class="card" data-index="'+code+'">'+card.title+'</a>');
		});
		$.each(snapshot.variation[1], function (code, qty) {
			var card = NRDB.data.cards.findById(code);
			if(!card) return;
			list.push('&minus;'+qty+' '+'<a href="'+Routing.generate('cards_zoom',{card_code:code})+'" class="card" data-index="'+code+'">'+card.title+'</a>');
		});
	} else {
		list.push("First version");
	}

	$('#tbody-history').prepend('<tr'+(snapshot.saved ? '' : ' class="warning"')+'><td>'+snapshot.date_creation.calendar()+(snapshot.saved ? '' : ' (unsaved)')+'</td><td>'+list.join('<br>')+'</td><td><a role="button" href="#" data-index="'+(Snapshots.length-1)+'"">Revert</a></td></tr>');

	Autosave_timer = -1; // start timer
}
function load_snapshot(event) {
	var index = $(this).data('index');
	var snapshot = Snapshots[index];
	if(!snapshot) return;

	NRDB.data.cards.find().forEach(function(card) {
		var indeck = 0;
		if (snapshot.content[card.code]) {
			indeck = parseInt(snapshot.content[card.code], 10);
		}
		NRDB.data.cards.updateById(card.code, {
			indeck : indeck
		});
	});
	update_deck();
	refresh_collection();
	NRDB.suggestions.compute();
	Deck_changed_since_last_autosave = true;
	return false;
}
function deck_autosave() {
	// check if deck has been modified since last autosave
	if(!Deck_changed_since_last_autosave || !Deck_id) return;
	// compute diff between last snapshot and current deck
	var last_snapshot = Snapshots[Snapshots.length-1].content;
	var current_deck = get_deck_content();
	Deck_changed_since_last_autosave = false;
	var r = NRDB.diff.compute_simple([current_deck, last_snapshot]);
	if(!r) return;
	var diff = JSON.stringify(r[0]);
	if(diff == '[{},{}]') return;
	// send diff to autosave
	$('#tab-header-history').html("Autosave...");
	Autosave_running = true;
	$.ajax(Routing.generate('deck_autosave', {deck_id:Deck_id}), {
		data: {diff:diff},
		type: 'POST',
		success: function(data, textStatus, jqXHR) {
			add_snapshot({date_creation: data, variation: r[0], content: current_deck, saved: false});
		},
		error: function(jqXHR, textStatus, errorThrown) {
			console.log('['+moment().format('YYYY-MM-DD HH:mm:ss')+'] Error on '+this.url, textStatus, errorThrown);
			Deck_changed_since_last_autosave = true;
		},
		complete: function () {
			$('#tab-header-history').html("History");
			Autosave_running = false;
		}
	});
}
function handle_header_click(event) {
	event.preventDefault();
	var new_sort = $(this).data('sort');
	if (Sort == new_sort) {
		Order *= -1;
	} else {
		Sort = new_sort;
		Order = 1;
	}
	$(this).closest('tr').find('th').removeClass('dropup').find('span.caret')
			.remove();
	$(this).after('<span class="caret"></span>').closest('th').addClass(
			Order > 0 ? '' : 'dropup');
	refresh_collection();
}
function handle_input_change(event) {
	var div = $(this).closest('.filter');
	var columnName = div.attr('id');
	var arr = [];
	div.find("input[type=checkbox]").each(function(index, elt) {
		var name = $(elt).attr('name');
		
		if (name && $(elt).prop('checked')) {
			arr.push(name);
		}
		
		if (columnName == "pack_code") {
			var key = 'pack_code_' + name,
				value = $(elt).prop('checked') ? "on" : "off";
			localforage.setItem(key, value);
		}
	});
	Filters[columnName] = arr;
	FilterQuery = get_filter_query(Filters);
	refresh_collection();
}
function get_deck_content() {
	return _.reduce(
			NRDB.data.cards.find({indeck:{'$gt':0}}),
			function (acc, card) { acc[card.code] = card.indeck; return acc; },
			{});
}
function handle_submit(event) {
	Deck_changed_since_last_autosave = false;
	var deck_json = JSON.stringify(get_deck_content());
	$('input[name=content]').val(deck_json);
	$('input[name=description]').val($('textarea[name=description_]').val());
	$('input[name=tags]').val($('input[name=tags_]').val());
}

function handle_quantity_change(event) {
	var index = $(this).closest('.card-container').data('index')
			|| $(this).closest('div.modal').data('index');
	var in_collection = $(this).closest('#collection').length;
	var quantity = parseInt($(this).val(), 10);
	$(this).closest('.card-container')[quantity ? "addClass" : "removeClass"]('in-deck');
	NRDB.data.cards.updateById(index, {
		indeck : quantity
	});
	var card = NRDB.data.cards.findById(index);
	if (card.type_code == "identity") {
		if (Identity.faction_code != card.faction_code) {
			// change of faction, reset agendas
			NRDB.data.cards.update({
				indeck : {
					'$gt' : 0
				},
				type_code : 'agenda'
			}, {
				indeck : 0
			});
			// also automatically change tag of deck
			$('input[name=tags_]').val(
					$('input[name=tags_]').val().split(' ').map(function (tag) {
						return tag === Identity.faction_code ? card.faction_code : tag;
					}).join(' ')
			);
		}
		NRDB.data.cards.update({
			indeck : {
				'$gt' : 0
			},
			type_code : 'identity',
			code : {
				'$ne' : index
			}
		}, {
			indeck : 0
		});
	}
	update_deck();
	if (card.type_code == "identity") {
		NRDB.draw_simulator.reset();
		$.each(CardDivs, function(nbcols, rows) {
			if (rows)
				$.each(rows, function(index, row) {
					row.removeClass("disabled").find('label').removeClass(
							"disabled").find('input[type=radio]').attr(
							"disabled", false);
				});
		});
		refresh_collection();
	} else {
		$.each(CardDivs, function(nbcols, rows) {
			// rows is an array of card rows
			if (rows && rows[index]) {
				// rows[index] is the card row of our card
				rows[index].find('input[name="qty-' + index + '"]').each(
					function(i, element) {
						if ($(element).val() != quantity) {
							$(element).prop('checked', false).closest(
							'label').removeClass('active');
						} else {
							if(!in_collection) {
								$(element).prop('checked', true).closest(
								'label').addClass('active');
							}
						}
					}
				);
			}
		});
	}
	$('div.modal').modal('hide');
	NRDB.suggestions.compute();

	Deck_changed_since_last_autosave = true;
}

function update_core_sets() {
	CardDivs = [ null, {}, {}, {} ];
	NRDB.data.cards.find({
		pack_code : ['core', 'core2']
	}).forEach(function(card) {
        var modifiedCard = get_mwl_modified_card(card);
		var max_qty = Math.min(card.quantity * NRDB.settings.getItem('core-sets'), modifiedCard.deck_limit);
		if(Identity.pack_code == "draft") {
			max_qty = 9;
		}
		NRDB.data.cards.updateById(card.code, {
			maxqty : max_qty
		});
	});
}

function update_mwl(event) {
	var mwl_code = $(this).val();
	MWL = null;
	if(mwl_code) {
		MWL = NRDB.data.mwl.findById(mwl_code);
	}
	CardDivs = [ null, {}, {}, {} ];
	update_max_qty();
	refresh_collection();
	update_deck();
}

function build_div(record) {
	var influ = "";
	for (var i = 0; i < record.faction_cost; i++)
		influ += "●";

	var radios = '';
	for (var i = 0; i <= record.maxqty; i++) {
		if(i && !(i%4)) {
			radios += '<br>';
		}
		radios += '<label class="btn btn-xs btn-default'
				+ (i == record.indeck ? ' active' : '')
				+ '"><input type="radio" name="qty-' + record.code
				+ '" value="' + i + '">' + i + '</label>';
	}

	var div = '';
	switch (Number(NRDB.settings.getItem('display-columns'))) {
	case 1:

		var imgsrc = record.faction_code.substr(0,7) === "neutral" ? "" : '<img src="'
				+ Url_FactionImage.replace('xxx', record.faction_code)
				+ '" alt="'+record.faction.name+'">';
		div = $('<tr class="card-container" data-index="'
				+ record.code
				+ '"><td><div class="btn-group" data-toggle="buttons">'
				+ radios
				+ '</div></td><td><a class="card" href="'
				+ Routing.generate('cards_zoom', {card_code:record.code})
				+ '" data-target="#cardModal" data-remote="false" data-toggle="modal">'
				+ record.title + '</a> '+get_influence_penalty_icons(record)+'</td><td class="influence influence-' + record.faction_code
				+ '">' + influ + '</td><td class="type" title="' + record.type.name
				+ '"><img src="/images/types/'
				+ record.type_code + '.png" alt="'+record.type.name+'">'
				+ '</td><td class="faction" title="' + record.faction.name + '">'
				+ imgsrc + '</td></tr>');
		break;

	case 2:

		div = $('<div class="col-sm-6 card-container" data-index="'
				+ record.code
				+ '">'
				+ '<div class="media"><div class="media-left">'
				+ '<img class="media-object" src="'+record.imageUrl+'" alt="'+record.title+'">'
				+ '</div><div class="media-body">'
				+ '    <h4 class="media-heading"><a class="card" href="'
				+ Routing.generate('cards_zoom', {card_code:record.code})
				+ '" data-target="#cardModal" data-remote="false" data-toggle="modal">'
				+ record.title + '</a> '+get_influence_penalty_icons(record)+'</h4>'
				+ '    <div class="btn-group" data-toggle="buttons">' + radios
				+ '</div>' + '    <span class="influence influence-' + record.faction_code + '">'
				+ influ + '</span>' + '</div>' + '</div>' + '</div>');
		break;

	case 3:

		div = $('<div class="col-sm-4 card-container" data-index="'
				+ record.code
				+ '">'
				+ '<div class="media"><div class="media-left">'
				+ '<img class="media-object" src="'+record.imageUrl+'" alt="'+record.title+'">'
				+ '</div><div class="media-body">'
				+ '    <h5 class="media-heading"><a class="card" href="'
				+ Routing.generate('cards_zoom', {card_code:record.code})
				+ '" data-target="#cardModal" data-remote="false" data-toggle="modal">'
				+ record.title + '</a> '+get_influence_penalty_icons(record)+'</h5>'
				+ '    <div class="btn-group" data-toggle="buttons">' + radios
				+ '</div>' + '    <span class="influence influence-' + record.faction_code + '">'
				+ influ + '</span>' + '</div>' + '</div>' + '</div>');
		break;

	}

	return div;
}

function is_card_usable(record) {
	if (Identity.code == "03002"
			&& record.faction_code == "jinteki")
		return false;
	if (record.type_code === "agenda"
			&& record.faction_code !== "neutral-corp"
			&& record.faction_code !== Identity.faction_code
			&& Identity.faction_code !== "neutral-corp")
		return false;
	return true;
}

function update_filtered() {
	$('#collection-table').empty();
	$('#collection-grid').empty();

	var counter = 0, container = $('#collection-table'), display_columns = NRDB.settings.getItem('display-columns');
	var SmartFilterQuery = NRDB.smart_filter.get_query(FilterQuery);
	
	var orderBy = {};
	orderBy[Sort] = Order;
	if(Sort != 'title') orderBy['title'] = 1;
	
	NRDB.data.cards.find(SmartFilterQuery, {'$orderBy':orderBy}).forEach(function(card) {
		if (ShowOnlyDeck && !card.indeck)
			return;

		var unusable = !is_card_usable(card);

		if (HideDisabled && unusable)
			return;

		var index = card.code;
		var row = (CardDivs[display_columns][index] || (CardDivs[display_columns][index] = build_div(card)))
				.data("index", card.code);
		row.find('input[name="qty-' + card.code + '"]').each(
				function(i, element) {
					if ($(element).val() == card.indeck)
						$(element).prop('checked', true)
								.closest('label').addClass(
										'active');
					else
						$(element).prop('checked', false)
								.closest('label').removeClass(
										'active');
				});

		if (unusable)
			row.find('label').addClass("disabled").find(
					'input[type=radio]').attr("disabled", true);

		if (display_columns > 1
				&& counter % display_columns === 0) {
			container = $('<div class="row"></div>').appendTo(
					$('#collection-grid'));
		}
		container.append(row);
		counter++;
	});
}
var refresh_collection = debounce(update_filtered, 250);

function alert_if_unsaved(event) {
	if(Deck_changed_since_last_autosave && !window.confirm("Deck is not saved. Do you really want to leave?")) {
		event.preventDefault();
		return false;
	}
}
