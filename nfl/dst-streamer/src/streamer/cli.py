import argparse


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="streamer", description="D/ST streamer stats pipeline")
    # build, refresh and validate-points arrive with their milestones.
    sub = parser.add_subparsers(dest="command", required=True)

    ingest = sub.add_parser("ingest", help="cache nflverse/Sleeper data and snapshot odds")
    ingest.add_argument("--season", type=int, help="season start year (default: current)")
    ingest.add_argument("--week", type=int, help="target week (default: next week with games)")

    args = parser.parse_args(argv)
    if args.command == "ingest":
        from streamer.ingest.run import ingest as run_ingest

        run_ingest(args.season, args.week)


if __name__ == "__main__":
    main()
