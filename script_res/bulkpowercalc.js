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
		type: '???',
		category: 'Special',
		hits: 1
	});
	var physicalMove = $.extend({}, moves['Body Slam'], {
		name: 'Body Slam',
		bp: 999,
		type: '???',
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
function calcBulk(defender, results, attackerSideIndex) {
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

function updateChampionsP1Bulk(p1, p2, field) {
	if (!$('#p1BulkPhys').length || gen != 10) return;
	var p1c = JSON.parse(JSON.stringify(p1));
	var p2c = JSON.parse(JSON.stringify(p2));
	p1c.hasType = setHasTypeFunc;
	p2c.hasType = setHasTypeFunc;
	var attackerDummy = createBulkAttackDummy(p2c);
	var results = calculateAllMovesNoBoost(p1c, attackerDummy, field);
	var bulk = calcBulk(p1c, results, 1);
	$('#p1BulkPhys').val(String(bulk[0]));
	$('#p1BulkSpec').val(String(bulk[1]));
}
