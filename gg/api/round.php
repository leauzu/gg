<?php
require __DIR__ . '/_lib.php';
if ($_SERVER['REQUEST_METHOD'] !== 'POST') send_json(405, ['error' => 'Method not allowed']);

const ZONES = ['player', 'banker', 'tie', 'playerPair', 'bankerPair'];
const LIGHTNING_MULTS = [2, 3, 4, 5, 8];

function rand_int_secure(int $min, int $max): int { return random_int($min, $max); }

function create_deck(int $decks = 8): array {
    $suits = ['♠', '♥', '♦', '♣'];
    $values = [
        ['n'=>'A','v'=>1], ['n'=>'2','v'=>2], ['n'=>'3','v'=>3], ['n'=>'4','v'=>4], ['n'=>'5','v'=>5],
        ['n'=>'6','v'=>6], ['n'=>'7','v'=>7], ['n'=>'8','v'=>8], ['n'=>'9','v'=>9], ['n'=>'10','v'=>0],
        ['n'=>'J','v'=>0], ['n'=>'Q','v'=>0], ['n'=>'K','v'=>0],
    ];
    $shoe = [];
    for ($d = 0; $d < $decks; $d++) {
        foreach ($suits as $suit) {
            foreach ($values as $val) {
                $shoe[] = ['n'=>$val['n'], 'v'=>$val['v'], 'suit'=>$suit];
            }
        }
    }
    for ($i = count($shoe) - 1; $i > 0; $i--) {
        $j = rand_int_secure(0, $i);
        [$shoe[$i], $shoe[$j]] = [$shoe[$j], $shoe[$i]];
    }
    return $shoe;
}

function sanitize_bets($input): array {
    $bets = ['player'=>0, 'banker'=>0, 'tie'=>0, 'playerPair'=>0, 'bankerPair'=>0];
    foreach (ZONES as $zone) {
        $n = (int)floor((float)($input[$zone] ?? 0));
        if ($n < 0) throw new RuntimeException('Invalid bet amount.');
        if ($n > 100000000) throw new RuntimeException('Bet amount is too high.');
        $bets[$zone] = $n;
    }
    return $bets;
}

function pop_card(array &$deck): array { return array_pop($deck); }
function total2(array $a, array $b): int { return ($a['v'] + $b['v']) % 10; }
function card_equals(array $a, array $b): bool { return $a['n'] === $b['n'] && $a['suit'] === $b['suit']; }

function calc_round(array $bets): array {
    $shoe = create_deck(8);
    $pCard1 = pop_card($shoe); $pCard2 = pop_card($shoe);
    $bCard1 = pop_card($shoe); $bCard2 = pop_card($shoe);

    $pScore = total2($pCard1, $pCard2);
    $bScore = total2($bCard1, $bCard2);
    $pCard3 = null; $bCard3 = null;

    if ($pScore < 8 && $bScore < 8) {
        $pDrewThird = false; $pThirdVal = 0;
        if ($pScore <= 5) {
            $pCard3 = pop_card($shoe);
            $pDrewThird = true;
            $pThirdVal = $pCard3['v'];
            $pScore = ($pScore + $pThirdVal) % 10;
        }
        $bankerDraws = false;
        if ($pDrewThird) {
            $bankerDraws = (
                $bScore <= 2 ||
                ($bScore === 3 && $pThirdVal !== 8) ||
                ($bScore === 4 && in_array($pThirdVal, [2,3,4,5,6,7], true)) ||
                ($bScore === 5 && in_array($pThirdVal, [4,5,6,7], true)) ||
                ($bScore === 6 && in_array($pThirdVal, [6,7], true))
            );
        } elseif ($bScore <= 5) {
            $bankerDraws = true;
        }
        if ($bankerDraws) {
            $bCard3 = pop_card($shoe);
            $bScore = ($bScore + $bCard3['v']) % 10;
        }
    }

    $virtualDeck = create_deck(1);
    $lightningCount = rand_int_secure(1, 5);
    $lightningCards = [];
    for ($i = 0; $i < $lightningCount; $i++) {
        $c = pop_card($virtualDeck);
        $c['mult'] = LIGHTNING_MULTS[rand_int_secure(0, count(LIGHTNING_MULTS) - 1)];
        $lightningCards[] = $c;
    }

    $pMultTotal = 1; $bMultTotal = 1; $pPairMult = 1; $bPairMult = 1;
    foreach (array_values(array_filter([$pCard1, $pCard2, $pCard3])) as $idx => $c) {
        foreach ($lightningCards as $l) {
            if (card_equals($l, $c)) {
                $pMultTotal *= (int)$l['mult'];
                if ($idx < 2) $pPairMult *= (int)$l['mult'];
            }
        }
    }
    foreach (array_values(array_filter([$bCard1, $bCard2, $bCard3])) as $idx => $c) {
        foreach ($lightningCards as $l) {
            if (card_equals($l, $c)) {
                $bMultTotal *= (int)$l['mult'];
                if ($idx < 2) $bPairMult *= (int)$l['mult'];
            }
        }
    }

    $winner = $pScore > $bScore ? 'P' : ($bScore > $pScore ? 'B' : 'T');
    $pHasPair = $pCard1['n'] === $pCard2['n'];
    $bHasPair = $bCard1['n'] === $bCard2['n'];
    $payout = 0.0;

    if ($winner === 'P' && $bets['player'] > 0) $payout += $bets['player'] + $bets['player'] * $pMultTotal;
    if ($winner === 'B' && $bets['banker'] > 0) $payout += $bets['banker'] + 0.95 * $bets['banker'] * $bMultTotal;
    if ($winner === 'T') {
        if ($bets['tie'] > 0) $payout += $bets['tie'] + 5 * $bets['tie'] * $pMultTotal * $bMultTotal;
        $payout += $bets['player'] + $bets['banker'];
    }
    if ($pHasPair && $bets['playerPair'] > 0) $payout += $bets['playerPair'] + 9 * $bets['playerPair'] * $pPairMult;
    if ($bHasPair && $bets['bankerPair'] > 0) $payout += $bets['bankerPair'] + 9 * $bets['bankerPair'] * $bPairMult;

    return [
        'pCard1'=>$pCard1, 'pCard2'=>$pCard2, 'pCard3'=>$pCard3,
        'bCard1'=>$bCard1, 'bCard2'=>$bCard2, 'bCard3'=>$bCard3,
        'pScore'=>$pScore, 'bScore'=>$bScore,
        'pMultTotal'=>$pMultTotal, 'bMultTotal'=>$bMultTotal,
        'pPairMult'=>$pPairMult, 'bPairMult'=>$bPairMult,
        'winner'=>$winner, 'pHasPair'=>$pHasPair, 'bHasPair'=>$bHasPair,
        'lightningCards'=>$lightningCards,
        'payout'=>(int)floor($payout),
    ];
}

try {
    $user = current_user();
    if (!$user) send_json(401, ['error' => 'Please login first.']);
    $body = json_body();
    $bets = sanitize_bets($body['bets'] ?? []);
    $stakeTotal = array_sum($bets);
    $betCost = (int)floor($stakeTotal * 1.2);

    if ($betCost > (int)$user['balance']) {
        send_json(400, ['error' => 'Insufficient balance.', 'user' => public_user($user)]);
    }

    $round = calc_round($bets);
    $balanceAfterCost = max(0, (int)$user['balance'] - $betCost);
    $finalBalance = max(0, (int)floor($balanceAfterCost + (int)$round['payout']));

    $stmt = pdo()->prepare('UPDATE users SET balance = ?, updated_at = NOW() WHERE id = ? RETURNING id, username, balance');
    $stmt->execute([$finalBalance, (int)$user['id']]);
    $updated = $stmt->fetch();

    send_json(200, [
        'user' => public_user($updated),
        'balanceBeforeRound' => (int)$user['balance'],
        'balanceAfterCost' => $balanceAfterCost,
        'finalBalance' => $finalBalance,
        'betCost' => $betCost,
        'stakeTotal' => $stakeTotal,
        'round' => array_merge($round, ['betsSnapshot' => $bets]),
    ]);
} catch (Throwable $e) {
    send_json(500, ['error' => $e->getMessage() ?: 'Round failed']);
}
