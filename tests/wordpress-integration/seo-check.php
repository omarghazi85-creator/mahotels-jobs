<?php
/** Executed by wp-cli against an isolated WordPress database. */
function check_case($ok, $message) { if (!$ok) { throw new RuntimeException($message); } }
$coexist = getenv('LITE_TEST_COEXIST') === '1';
if ($coexist) {
    check_case(class_exists('MA_Hotels_Jobs'), 'legacy fixture not active');
    check_case(!class_exists('MA_Hotels_Jobs_Lite_SEO'), 'Lite SEO must not load alongside legacy');
    check_case(apply_filters('wp_robots', array()) === array('legacy_fixture' => true), 'legacy robots hook duplicated or missing');
    echo "coexistence: PASS\n";
    return;
}
check_case(class_exists('MA_Hotels_Jobs_Lite_SEO'), 'Lite SEO hooks not loaded');
check_case(has_filter('wp_robots', array('MA_Hotels_Jobs_Lite_SEO','robots')) !== false, 'robots hook missing');
check_case(has_filter('rank_math/sitemap/entry', array('MA_Hotels_Jobs_Lite_SEO','sitemap_entry')) !== false, 'sitemap hook missing');
$term = wp_insert_term('السعودية', 'ma_job_country', array('slug' => 'saudi-arabia'));
check_case(!is_wp_error($term), 'term creation failed');
$content = '<h2>المهام والمسؤوليات</h2><p>' . str_repeat('تفاصيل العمل الفندقي ', 35) . '</p><h2>المتطلبات والمؤهلات</h2><p>خبرة عملية</p>';
$id = wp_insert_post(array('post_type'=>'ma_hotel_job','post_status'=>'publish','post_title'=>'مدير فندق – الرياض','post_content'=>$content), true);
check_case(!is_wp_error($id) && $id, 'job creation failed');
wp_set_object_terms($id, array((int)$term['term_id']), 'ma_job_country');
$fields = array('_ma_job_source_id'=>'test-1','_ma_job_ar_ready'=>'1','_ma_job_posted_on'=>gmdate('Y-m-d'),'_ma_job_verified_on'=>gmdate('Y-m-d'),'_ma_job_source_url'=>'https://careers.marriott.com/job/test','_ma_job_company'=>'فندق تجريبي','_ma_job_city'=>'الرياض','_ma_job_role'=>'مدير فندق');
foreach ($fields as $key=>$value) { update_post_meta($id, $key, $value); }
query_posts(array('post_type'=>'ma_hotel_job','p'=>$id));
check_case(is_singular('ma_hotel_job'), 'singular query failed');
check_case(MA_Hotels_Jobs_Lite_SEO::eligible($id), 'valid job rejected');
$robots = apply_filters('wp_robots', array('index'=>true));
check_case(empty($robots['noindex']), 'valid job incorrectly noindexed');
ob_start(); do_action('wp_head'); $html=ob_get_clean();
check_case(strpos($html, '"@type":"JobPosting"') !== false, 'eligible JobPosting absent');
check_case(strpos($html, '"validThrough"') === false, 'unknown expiration invented');
check_case(apply_filters('rank_math/sitemap/entry', 'entry', 'post', get_post($id)) === 'entry', 'eligible job excluded from sitemap');
update_post_meta($id, '_ma_job_verified_on', gmdate('Y-m-d', time()-9*DAY_IN_SECONDS));
check_case(!MA_Hotels_Jobs_Lite_SEO::eligible($id), 'stale job accepted');
check_case(!empty(apply_filters('wp_robots', array('index'=>true))['noindex']), 'stale job is not noindex');
check_case(apply_filters('rank_math/frontend/robots', array())['index'] === 'noindex', 'Rank Math noindex missing');
check_case(apply_filters('rank_math/sitemap/entry', 'entry', 'post', get_post($id)) === false, 'stale job in sitemap');
ob_start(); do_action('wp_head'); $html=ob_get_clean();
check_case(strpos($html, '"@type":"JobPosting"') === false, 'stale job has schema');
$page = wp_insert_post(array('post_type'=>'page','post_status'=>'publish','post_title'=>'Jobs','post_content'=>'[ma_hotels_jobs]'), true);
query_posts(array('page_id'=>$page));
check_case(is_singular('page'), 'board query failed');
$_GET = array('mh_country'=>'saudi-arabia', 'mh_page'=>'2');
$canonical = apply_filters('rank_math/frontend/canonical', 'original');
check_case(strpos($canonical, 'mh_country=saudi-arabia') !== false && strpos($canonical, 'mh_page=2') !== false, 'country/page canonical mismatch');
$_GET['mh_city'] = 'الرياض';
check_case(!empty(apply_filters('wp_robots', array('index'=>true))['noindex']), 'filtered board not noindexed');
check_case(strpos(apply_filters('rank_math/frontend/canonical', 'original'), 'mh_page=2') === false, 'filtered board retains page canonical');
echo "WordPress SEO integration: PASS\n";
