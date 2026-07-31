/**
 * Bulk ratings for Champions: defender's effective HP vs standardized 999 BP ???-type hits
 * from a dummy attacker patterned after the opponent. Scaled so bulk matches the legacy
 * reference (min damage 374 vs a standard Ditto target at level 50).
 */
var BULK_REFERENCE_MIN_DAMAGE = 374;

function bulkDummyTypes(opponentMon) {
	var types = [opponentMon.type1];
	if (opponentMon.type2 && opponentMon.type2 !== opponentMon.type1) {
		types.push(opponentMon.type2);
	}
	return types.map(function (ty) {
		return ty === '???' ? 'Normal' : ty;
	});
}

function dittoBulkRawStats() {
	var bs = pokedex['Ditto'].bs;
	var rawStats = {};
	for (var i = 0; i < STATS.length; i++) {
		var stat = STATS[i];
		if (stat === 'hp') {
			rawStats.hp = Math.floor((bs.hp * 2 + 31) * 50 / 100) + 50 + 10;
		} else {
			rawStats[stat] = Math.floor((Math.floor((bs[stat] * 2 + 31) * 50 / 100) + 5));
		}
	}
	return rawStats;
}

function createBulkAttackDummy(opponentMon) {
	var types = bulkDummyTypes(opponentMon);
	var rawStats = dittoBulkRawStats();
	var specialMove = $.extend({}, moves['Thunderbolt'], {
		name: 'Thunderbolt',
		bp: 999,
		type: 'Typeless',
		category: 'Special',
		hits: 1
	});
	var physicalMove = $.extend({}, moves['Body Slam'], {
		name: 'Body Slam',
		bp: 999,
		type: 'Typeless',
		category: 'Physical',
		hits: 1
	});
	var none = { name: '(No Move)', bp: 0, type: 'Normal', category: 'Status', hits: 1 };
	return {
		name: 'Ditto',
		type1: types[0],
		type2: types.length > 1 ? types[1] : '',
		level: opponentMon.level,
		ability: opponentMon.ability,
		abilityOn: opponentMon.abilityOn,
		nature: 'Hardy',
		status: 'Healthy',
		isDynamaxed: false,
		isTerastalize: false,
		gmax_factor: false,
		item: '',
		weight: opponentMon.weight,
		maxHP: rawStats.hp,
		curHP: rawStats.hp,
		rawStats: rawStats,
		boosts: { hp: 0, at: 0, df: 0, sa: 0, sd: 0, sp: opponentMon.boosts.sp },
		sps: { hp: 0, at: 0, df: 0, sa: 0, sd: 0, sp: 0 },
		evs: { hp: 0, at: 0, df: 0, sa: 0, sd: 0, sp: 0 },
		ivs: { hp: 31, at: 31, df: 31, sa: 31, sd: 31, sp: 31 },
		stats: {},
		highestStat: -1,
		moves: [specialMove, physicalMove, none, none],
		hasType: setHasTypeFunc
	};
}

function damageMinRoll(result, hits) {
	return calcMinMaxDamage(result.damage, hits || 1)[0];
}

/** @returns {[number, number]} [physical bulk, special bulk] */
function calcBulkFromResults(defender, results, attackerSideIndex) {
	var spDamage = damageMinRoll(results[attackerSideIndex][0], results[attackerSideIndex][0].hits);
	var physDamage = damageMinRoll(results[attackerSideIndex][1], results[attackerSideIndex][1].hits);
	if (!spDamage) spDamage = 1;
	if (!physDamage) physDamage = 1;
	var hp = defender.maxHP;
	var spBulk = Math.round((BULK_REFERENCE_MIN_DAMAGE * hp) / spDamage);
	var physBulk = Math.round((BULK_REFERENCE_MIN_DAMAGE * hp) / physDamage);
	return [physBulk, spBulk];
}

function prepMonForBulkDamage(mon, tailwindIndex, field) {
	checkTerastal(mon);
	checkSeeds(mon, field.getTerrain());
	checkKlutz(mon);
	for (var i = 0; i < STATS.length; i++) {
		if (STATS[i] !== 'hp') {
			mon.stats[STATS[i]] = getModifiedStat(mon.rawStats[STATS[i]], mon.boosts[STATS[i]]);
		}
	}
	setHighestStat(mon, tailwindIndex);
	mon.stats[SP] = getFinalSpeed(mon, field.getWeather(), field.getTailwind(tailwindIndex), field.getSwamp(tailwindIndex), field.getTerrain());
}

/**
 * Uses clones + a trimmed damage path so defender/attacker boosts are not applied twice and the
 * dummy does not pick up opponent-side ability interactions meant for the real battle calc.
 */
function calculateAllMovesNoBoost(p1Defender, attackerDummy, field) {
	var p1c = JSON.parse(JSON.stringify(p1Defender));
	var attacker = JSON.parse(JSON.stringify(attackerDummy));
	p1c.hasType = setHasTypeFunc;
	attacker.hasType = setHasTypeFunc;

	prepMonForBulkDamage(p1c, 0, field);
	prepMonForBulkDamage(attacker, 1, field);

	var side = field.getSide(0);
	var results = [[], []];
	results[1][0] = GET_DAMAGE_SV(attacker, p1c, attacker.moves[0], side);
	results[1][1] = GET_DAMAGE_SV(attacker, p1c, attacker.moves[1], side);
	results[1][0].hits = attacker.moves[0].hits;
	results[1][1].hits = attacker.moves[1].hits;
	return results;
}

function updateOneMonBulk(defender, opponent, field, sideId) {
	var defenderC = JSON.parse(JSON.stringify(defender));
	var opponentC = JSON.parse(JSON.stringify(opponent));
	defenderC.hasType = setHasTypeFunc;
	opponentC.hasType = setHasTypeFunc;

	var attackerDummy = createBulkAttackDummy(opponentC);
	var results = calculateAllMovesNoBoost(defenderC, attackerDummy, field);
	var bulk = calcBulkFromResults(defenderC, results, 1);
	$(sideId + ' .bdf').text(String(bulk[0]));
	$(sideId + ' .bsd').text(String(bulk[1]));
}

function updateAllChampionsBulk(p1, p2, field) {
	if (gen != 10) return;
	updateOneMonBulk(p1, p2, field, '#p1');
	updateOneMonBulk(p2, p1, field, '#p2');
}

/**
 * Power ratings for Champions: min-roll damage each move deals to a standardized, neutral
 * Ditto target (0 boosts, no item/ability, 31 IVs, 0 EVs/SPs, Typeless type), using the mon's
 * real ability/item/boosts/status/tera/dynamax and the real field/side conditions.
 */
function createPowerTargetDummy(opponentMon) {
	var types = bulkDummyTypes(opponentMon);
	var rawStats = dittoBulkRawStats();
	var hpPercent = opponentMon.curHP / opponentMon.maxHP;
	var none = { name: '(No Move)', bp: 0, type: 'Normal', category: 'Status', hits: 1 };
	return {
		name: 'Ditto',
		type1: types[0],
		type2: types.length > 1 ? types[1] : '',
		level: opponentMon.level,
		ability: opponentMon.ability,
		abilityOn: opponentMon.abilityOn,
		nature: 'Hardy',
		status: opponentMon.status,
		toxicCounter: opponentMon.toxicCounter,
		isDynamaxed: opponentMon.isDynamaxed,
		isTerastalize: opponentMon.isTerastalize,
		tera_type: opponentMon.tera_type,
		gmax_factor: opponentMon.gmax_factor,
		item: opponentMon.item,
		weight: opponentMon.weight,
		maxHP: rawStats.hp,
		curHP: Math.max(0, Math.round(rawStats.hp * hpPercent)),
		rawStats: rawStats,
		boosts: { hp: 0, at: 0, df: 0, sa: 0, sd: 0, sp: opponentMon.boosts.sp },
		sps: { hp: 0, at: 0, df: 0, sa: 0, sd: 0, sp: 0 },
		evs: { hp: 0, at: 0, df: 0, sa: 0, sd: 0, sp: 0 },
		ivs: { hp: 31, at: 31, df: 31, sa: 31, sd: 31, sp: 31 },
		stats: {},
		highestStat: -1,
		moves: [none, none, none, none],
		hasType: setHasTypeFunc
	};
}

/** @returns {number[]} min-roll damage for each of the attacker's 4 moves vs the standardized target */
function calculatePowerForSide(realAttacker, opponent, attackerSideIndex, field) {
	var attacker = JSON.parse(JSON.stringify(realAttacker));
	attacker.hasType = setHasTypeFunc;
	var targetSideIndex = 1 - attackerSideIndex;
	var target = createPowerTargetDummy(opponent);

	prepMonForBulkDamage(attacker, attackerSideIndex, field);
	prepMonForBulkDamage(target, targetSideIndex, field);

	var side = field.getSide(targetSideIndex);
	var powers = [];
	for (var i = 0; i < 4; i++) {
		var move = attacker.moves[i];
		var result = GET_DAMAGE_SV(attacker, target, move, side);
		powers.push(calcMinMaxDamage(result.damage, move.hits || 1)[0]);
	}
	return powers;
}

function updateAllChampionsPower(p1, p2, field) {
	if (gen != 10) return;
	var p1Powers = calculatePowerForSide(p1, p2, 0, field);
	var p2Powers = calculatePowerForSide(p2, p1, 1, field);
	for (var i = 0; i < 4; i++) {
		$('#resultPowerL' + (i + 1)).text(String(p1Powers[i]));
		$('#resultPowerR' + (i + 1)).text(String(p2Powers[i]));
	}
}