<?php
/* Plugin Name: MA Hotels Jobs legacy test fixture */
class MA_Hotels_Jobs {}
add_filter('wp_robots', function ($robots) { $robots['legacy_fixture'] = true; return $robots; });
