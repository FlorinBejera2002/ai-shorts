package worker

import "testing"

func TestDeliveredChargeProratesUndeliveredClips(t *testing.T) {
	cases := []struct{ charged, requested, delivered, want int }{
		{50, 5, 5, 50}, // full delivery keeps the reservation
		{50, 5, 3, 30}, // two missing clips are refunded
		{50, 5, 0, 0},  // nothing delivered refunds everything
		{0, 5, 2, 0},   // admin work stays free
		{50, 5, 7, 50}, // never charge more than was reserved
		{50, 0, 1, 50}, // legacy rows without a requested count are untouched
	}
	for _, c := range cases {
		if got := deliveredCharge(c.charged, c.requested, c.delivered); got != c.want {
			t.Errorf("deliveredCharge(%d,%d,%d)=%d, want %d", c.charged, c.requested, c.delivered, got, c.want)
		}
	}
}
