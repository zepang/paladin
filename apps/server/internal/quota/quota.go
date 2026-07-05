package quota

import (
	"context"
	_ "embed"
	"fmt"
	"strconv"
	"sync/atomic"
	"time"

	"github.com/redis/go-redis/v9"
)

//go:embed script.lua
var checkAndConsumeScript string

type Decision struct {
	Allowed bool
	Used    int
	Limit   int
	ResetAt time.Time
}

type Limiter struct {
	rdb       *redis.Client
	limit     int
	window    time.Duration
	scriptSHA string
	keyPrefix string
	seq       uint64
}

func NewLimiter(rdb *redis.Client, limit int, window time.Duration) *Limiter {
	l := &Limiter{
		rdb:       rdb,
		limit:     limit,
		window:    window,
		keyPrefix: "quota",
	}
	if rdb != nil {
		if sha, err := rdb.ScriptLoad(context.Background(), checkAndConsumeScript).Result(); err == nil {
			l.scriptSHA = sha
		}
	}
	return l
}

func (l *Limiter) key(userKey string) string {
	return fmt.Sprintf("%s:{%s}", l.keyPrefix, userKey)
}

func (l *Limiter) resetAt(now time.Time) time.Time {
	return now.Add(l.window)
}

func (l *Limiter) CheckAndConsume(ctx context.Context, userKey string) (Decision, error) {
	now := time.Now()
	nowMicros := now.UnixMicro()
	windowStartMicros := now.Add(-l.window).UnixMicro()
	windowSeconds := int64(l.window / time.Second)
	if windowSeconds < 1 {
		windowSeconds = 1
	}
	seq := atomic.AddUint64(&l.seq, 1)
	member := fmt.Sprintf("%d:%d", nowMicros, seq)

	key := l.key(userKey)
	args := []interface{}{
		nowMicros,
		windowStartMicros,
		l.limit,
		windowSeconds,
		member,
	}

	var res *redis.Cmd
	if l.scriptSHA != "" {
		res = l.rdb.EvalSha(ctx, l.scriptSHA, []string{key}, args...)
	} else {
		res = l.rdb.Eval(ctx, checkAndConsumeScript, []string{key}, args...)
	}

	raw, err := res.Result()
	if err != nil {
		return Decision{}, err
	}
	arr, ok := raw.([]interface{})
	if !ok || len(arr) < 3 {
		return Decision{}, fmt.Errorf("quota: unexpected script result: %v", raw)
	}
	allowedFlag, _ := arr[0].(int64)
	used, _ := arr[1].(int64)
	limitVal, _ := arr[2].(int64)

	return Decision{
		Allowed: allowedFlag == 1,
		Used:    int(used),
		Limit:   int(limitVal),
		ResetAt: l.resetAt(now),
	}, nil
}

func (l *Limiter) Status(ctx context.Context, userKey string) (Decision, error) {
	now := time.Now()
	windowStartMicros := now.Add(-l.window).UnixMicro()
	key := l.key(userKey)

	pipe := l.rdb.TxPipeline()
	pipe.ZRemRangeByScore(ctx, key, "0", strconv.FormatInt(windowStartMicros, 10))
	cardCmd := pipe.ZCard(ctx, key)
	_, err := pipe.Exec(ctx)
	if err != nil && err != redis.Nil {
		return Decision{}, err
	}
	used, _ := cardCmd.Result()

	remaining := int64(l.limit) - used
	if remaining < 0 {
		remaining = 0
	}
	_ = remaining

	return Decision{
		Allowed: used < int64(l.limit),
		Used:    int(used),
		Limit:   l.limit,
		ResetAt: l.resetAt(now),
	}, nil
}

func (l *Limiter) Limit() int            { return l.limit }
func (l *Limiter) Window() time.Duration { return l.window }
