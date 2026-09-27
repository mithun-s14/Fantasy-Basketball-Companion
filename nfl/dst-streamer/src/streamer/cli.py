import argparse


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="streamer", description="D/ST streamer stats pipeline")
    sub = parser.add_subparsers(dest="command", required=True)

    ingest = sub.add_parser("ingest", help="cache nflverse/Sleeper data and snapshot odds")
    ingest.add_argument("--season", type=int, help="season start year (default: current)")
    ingest.add_argument("--week", type=int, help="target week (default: next week with games)")

    build = sub.add_parser("build", help="build the D/ST table and write JSON + Markdown")
    build.add_argument("--season", type=int, help="season start year (default: current)")
    build.add_argument("--week", type=int, help="target week (default: next week with games)")
    build.add_argument(
        "--scoring",
        action="append",
        help="preset in config/scoring; repeatable (default: all presets)",
    )
    build.add_argument("--stage", default="manual", help="early | daily | final | manual")
    build.add_argument("--publish", action="store_true", help="upsert into Supabase")

    refresh = sub.add_parser("refresh", help="scheduled run: ingest + build --publish")
    refresh.add_argument("--stage", required=True, choices=["early", "daily", "final"])
    refresh.add_argument("--season", type=int, help="season start year (default: current)")
    refresh.add_argument("--week", type=int, help="target week (default: next week with games)")

    validate = sub.add_parser("validate-points", help="check D/ST points against Sleeper's stats")
    validate.add_argument("--season", type=int, required=True)
    validate.add_argument("--scoring", default="sleeper_default", help="preset in config/scoring")

    args = parser.parse_args(argv)
    if args.command == "ingest":
        from streamer.ingest.run import ingest as run_ingest

        run_ingest(args.season, args.week)
    elif args.command == "build":
        from streamer.build import build as run_build

        run_build(args.season, args.week, args.scoring, args.stage, args.publish)
    elif args.command == "refresh":
        from streamer.refresh import refresh as run_refresh

        run_refresh(args.stage, args.season, args.week)
    elif args.command == "validate-points":
        import polars as pl

        from streamer.ingest.run import CACHE
        from streamer.stats.fantasy_points import load_preset
        from streamer.stats.validate import validate_points

        pbp = pl.read_parquet(CACHE / f"pbp_{args.season}.parquet")
        schedules = pl.read_parquet(CACHE / f"schedules_{args.season}.parquet")
        preset = load_preset(args.scoring)
        if not validate_points(args.season, args.scoring, pbp, schedules, preset):
            raise SystemExit(1)


if __name__ == "__main__":
    main()
