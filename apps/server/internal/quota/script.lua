-- check_and_consume: atomic sliding-window quota check-and-consume
-- KEYS[1] = quota key (e.g. quota:{uid})
-- ARGV[1] = now (microseconds, score for this request)
-- ARGV[2] = window_start (microseconds; entries older than this are evicted)
-- ARGV[3] = limit (max allowed in window)
-- ARGV[4] = window_seconds (TTL for the key)
-- ARGV[5] = unique member for this request (timestamp + sequence)
-- returns: {allowed_flag(0/1), used_after, limit}
redis.call('ZREMRANGEBYSCORE', KEYS[1], 0, ARGV[2])
local n = redis.call('ZCARD', KEYS[1])
local limit = tonumber(ARGV[3])
if n >= limit then
  return {0, n, limit}
end
redis.call('ZADD', KEYS[1], ARGV[1], ARGV[5])
redis.call('EXPIRE', KEYS[1], ARGV[4])
return {1, n + 1, limit}
