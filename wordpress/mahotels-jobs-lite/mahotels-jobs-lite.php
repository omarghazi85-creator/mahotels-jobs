<?php
/**
 * Plugin Name: MAHotels Jobs Lite
 * Description: Lightweight job display and WordPress REST bridge. Recruitment, translation and scheduling run outside WordPress.
 * Version: 0.1.4
 * Author: MAHotels
 * Text Domain: mah-jobs-lite
 * Requires PHP: 7.4
 */
defined('ABSPATH') || exit;

/** Historical legacy 0.6.5 format; verify against installed 0.7.0 before use. */
function mah_jobs_lite_active_clause() {
    return array('relation' => 'OR',
        array('key' => '_ma_job_expires_on', 'compare' => 'NOT EXISTS'),
        array('key' => '_ma_job_expires_on', 'value' => '', 'compare' => '='),
        array('key' => '_ma_job_expires_on', 'value' => current_time('Y-m-d'), 'compare' => '>=', 'type' => 'DATE')
    );
}

function mah_jobs_lite_fields() {
    return array('company' => 'الفندق أو الجهة', 'city' => 'المدينة', 'role' => 'المسمى الوظيفي', 'source_url' => 'رابط الإعلان الأصلي', 'posted_on' => 'تاريخ الإعلان YYYY-MM-DD', 'expires_on' => 'تاريخ الانتهاء YYYY-MM-DD', 'verified_on' => 'تاريخ التحقق YYYY-MM-DD');
}

/**
 * Authenticated exact-match duplicate check for the historical metadata key.
 * Only reports existence, never exports the stored links or job records.
 * Confirm the key against installed 0.7.0 before using in production.
 */
add_action('rest_api_init', function () {
    register_rest_route('mahotels-jobs/v1', '/source-exists', array(
        'methods' => 'POST',
        'permission_callback' => function () {
            return current_user_can('edit_posts') && current_user_can('edit_others_posts');
        },
        'callback' => function ($request) {
            $url = $request->get_param('source_url');
            if (!is_string($url) || strlen($url) > 2048 || preg_match('/[\x00-\x20\x7f]/', $url)) {
                return new WP_Error('invalid_source_url', 'Invalid source URL.', array('status' => 400));
            }
            $parts = wp_parse_url($url);
            if (!is_array($parts) || empty($parts['host']) || !isset($parts['scheme']) ||
                !in_array(strtolower($parts['scheme']), array('https', 'http'), true) ||
                isset($parts['user']) || isset($parts['pass'])) {
                return new WP_Error('invalid_source_url', 'Invalid source URL.', array('status' => 400));
            }
            $ids = get_posts(array(
                'post_type' => 'ma_hotel_job',
                'post_status' => array('publish', 'draft', 'pending', 'private', 'future'),
                'posts_per_page' => 1,
                'fields' => 'ids',
                'no_found_rows' => true,
                'suppress_filters' => true,
                'meta_key' => '_ma_job_source_url',
                'meta_value' => $url,
            ));
            return rest_ensure_response(array('exists' => !empty($ids)));
        },
    ));
});
add_action('add_meta_boxes_ma_hotel_job', function () {
    if (class_exists('MA_Hotels_Jobs')) { return; }
    add_meta_box('mah_jobs_lite_details', 'تفاصيل الوظيفة ومصدرها', function ($post) {
        wp_nonce_field('mah_jobs_lite_save', 'mah_jobs_lite_nonce');
        foreach (mah_jobs_lite_fields() as $key => $label) {
            printf('<p><label for="mah-lite-%1$s">%2$s</label><br><input class="widefat" id="mah-lite-%1$s" name="mah_lite_%1$s" type="%3$s" value="%4$s"></p>', esc_attr($key), esc_html($label), $key === 'source_url' ? 'url' : 'text', esc_attr(get_post_meta($post->ID, '_ma_job_' . $key, true)));
        }
    }, 'ma_hotel_job', 'normal');
});
add_action('save_post_ma_hotel_job', function ($id) {
    if (class_exists('MA_Hotels_Jobs') || wp_is_post_revision($id) || !current_user_can('edit_post', $id) || !isset($_POST['mah_jobs_lite_nonce']) || !is_string($_POST['mah_jobs_lite_nonce']) || !wp_verify_nonce(sanitize_text_field(wp_unslash($_POST['mah_jobs_lite_nonce'])), 'mah_jobs_lite_save')) { return; }
    foreach (mah_jobs_lite_fields() as $key => $label) {
        $field = 'mah_lite_' . $key;
        if (!isset($_POST[$field]) || !is_string($_POST[$field])) { continue; }
        $value = wp_unslash($_POST[$field]);
        if ($key === 'source_url') { $value = esc_url_raw($value, array('http', 'https')); }
        elseif (in_array($key, array('posted_on', 'expires_on', 'verified_on'), true)) {
            if ($value !== '') {
                $date = DateTimeImmutable::createFromFormat('!Y-m-d', $value);
                // Preserve existing metadata when input is invalid, rather than silently clearing it.
                if (!$date || $date->format('Y-m-d') !== $value) { continue; }
            }
        } else { $value = sanitize_text_field($value); }
        update_post_meta($id, '_ma_job_' . $key, $value);
    }
});

// The legacy version owns details while it is active. Avoid duplicating output.
add_filter('the_content', function ($content) {
    if (class_exists('MA_Hotels_Jobs') || !is_singular('ma_hotel_job') || !in_the_loop() || !is_main_query()) { return $content; }
    $id = get_the_ID();
    $fields = array('company' => 'الفندق أو الجهة', 'city' => 'المدينة', 'role' => 'المسمى الوظيفي', 'posted_on' => 'تاريخ الإعلان', 'expires_on' => 'تاريخ الانتهاء', 'verified_on' => 'آخر تحقق');
    $details = '<dl class="ma-hotel-job-details">';
    foreach ($fields as $key => $label) {
        $value = get_post_meta($id, '_ma_job_' . $key, true);
        if ($value !== '') { $details .= '<dt>' . esc_html($label) . '</dt><dd>' . esc_html($value) . '</dd>'; }
    }
    $details .= '</dl>';
    $expires = get_post_meta($id, '_ma_job_expires_on', true);
    if ($expires && $expires < current_time('Y-m-d')) { $details .= '<p><strong>انتهت مدة هذا الإعلان، تحقق من المصدر قبل التقديم.</strong></p>'; }
    $source = get_post_meta($id, '_ma_job_source_url', true);
    $source = esc_url($source, array('http', 'https'));
    if ($source) { $content .= '<p class="ma-job-source-note">المصدر: صفحة التوظيف الأصلية لدى الجهة المعلنة. راجع تفاصيلها قبل إرسال طلبك.</p><p><a class="ma-job-apply" href="' . $source . '" rel="noopener noreferrer nofollow" target="_blank">التقديم عبر الإعلان الأصلي ↗</a></p>'; }
    return $details . $content;
});

add_action('pre_get_posts', function ($query) {
    if (class_exists('MA_Hotels_Jobs') || is_admin() || !$query->is_main_query() || !($query->is_post_type_archive('ma_hotel_job') || $query->is_tax('ma_job_country'))) { return; }
    $existing = $query->get('meta_query');
    $existing = is_array($existing) ? $existing : array();
    $existing[] = mah_jobs_lite_active_clause();
    $query->set('meta_query', $existing);
});

/**
 * Coexists safely during testing: the old plugin retains full control while
 * active. Existing posts, taxonomies and shortcode content are not modified.
 */
add_action('init', function () {
    if (!post_type_exists('ma_hotel_job')) {
        register_post_type('ma_hotel_job', array(
            'labels' => array(
                'name' => 'الوظائف الفندقية',
                'singular_name' => 'وظيفة فندقية',
                'add_new_item' => 'إضافة وظيفة فندقية',
                'edit_item' => 'تحرير الوظيفة',
            ),
            'public' => true,
            'show_ui' => true,
            'show_in_menu' => true,
            'show_in_rest' => true,
            'rest_base' => 'ma_hotel_job',
            'rest_controller_class' => 'WP_REST_Posts_Controller',
            'has_archive' => false, // /hotel-jobs is an existing Page, not a CPT archive.
            'rewrite' => array('slug' => 'hotel-job', 'with_front' => false),
            'supports' => array('title', 'editor', 'excerpt', 'revisions'),
            'map_meta_cap' => true,
        ));
    }

    if (!taxonomy_exists('ma_job_country')) {
        register_taxonomy('ma_job_country', array('ma_hotel_job'), array(
            'labels' => array('name' => 'الدول', 'singular_name' => 'الدولة'),
            'public' => true,
            'show_ui' => true,
            'show_admin_column' => true,
            'show_in_rest' => true,
            'rest_base' => 'ma_job_country',
            'hierarchical' => false,
            'rewrite' => array('slug' => 'hotel-jobs/country', 'with_front' => false),
        ));
    } else {
        register_taxonomy_for_object_type('ma_job_country', 'ma_hotel_job');
    }
}, 99);

/**
 * During coexistence let the old shortcode win. After retirement the existing
 * [ma_hotels_jobs] page seamlessly displays the same stored job posts.
 */
add_action('init', function () {
    if (shortcode_exists('ma_hotels_jobs')) {
        return;
    }
    add_shortcode('ma_hotels_jobs', 'mah_jobs_lite_shortcode');
}, 999);

// Independent, administrator-only preview while the legacy shortcode owns
// the live page. Never expose unpublished jobs or change the existing shortcode.
add_action('init', function () {
    add_shortcode('ma_hotels_jobs_lite_preview', function ($atts = array()) {
        if (!current_user_can('manage_options')) {
            return '';
        }
        return '<div class="mah-jobs-lite-preview"><p><strong>معاينة إدارية لإضافة MAHotels Jobs Lite</strong></p>'
            . mah_jobs_lite_shortcode($atts) . '</div>';
    });
}, 999);

function mah_jobs_lite_shortcode($atts = array()) {
    $atts = shortcode_atts(array('per_page' => 20), (array) $atts, 'ma_hotels_jobs');
    $per_page = min(24, max(1, absint($atts['per_page'])));
    // Existing public links use mh_page and country slugs in mh_country.
    // Keep the old preview's mhj_* parameters readable as a fallback.
    $page_input = isset($_GET['mh_page']) ? $_GET['mh_page'] : ($_GET['mhj_page'] ?? 1);
    $page = is_scalar($page_input) ? max(1, absint(wp_unslash($page_input))) : 1;
    $country_input = isset($_GET['mh_country']) ? $_GET['mh_country'] : ($_GET['mhj_country'] ?? '');
    $country_input = is_scalar($country_input) ? sanitize_text_field(wp_unslash((string) $country_input)) : '';
    $city_input = $_GET['mh_city'] ?? $_GET['mhj_city'] ?? '';
    $role_input = $_GET['mh_role'] ?? $_GET['mhj_job'] ?? '';
    $city = is_scalar($city_input) ? sanitize_text_field(wp_unslash((string) $city_input)) : '';
    $job_title = is_scalar($role_input) ? sanitize_text_field(wp_unslash((string) $role_input)) : '';
    $month_input = $_GET['mh_month'] ?? $_GET['mhj_month'] ?? '';
    $year_input = $_GET['mh_year'] ?? $_GET['mhj_year'] ?? '';
    $month = is_scalar($month_input) ? absint(wp_unslash($month_input)) : 0;
    $year = is_scalar($year_input) ? absint(wp_unslash($year_input)) : 0;
    $month = ($month >= 1 && $month <= 12) ? $month : 0;
    $year = ($year >= 2015 && $year <= (int) gmdate('Y') + 1) ? $year : 0;

    $terms = get_terms(array('taxonomy' => 'ma_job_country', 'hide_empty' => true));
    if (is_wp_error($terms)) {
        $terms = array();
    }
    $country = 0;
    foreach ($terms as $term) {
        if ($country_input !== '' && ($country_input === (string) $term->slug || $country_input === (string) $term->term_id)) {
            $country = (int) $term->term_id;
        }
    }

    $args = array(
        'post_type' => 'ma_hotel_job',
        'post_status' => 'publish',
        'posts_per_page' => $per_page,
        'paged' => $page,
        'orderby' => 'date',
        'order' => 'DESC',
        'no_found_rows' => false,
        'ignore_sticky_posts' => true,
        'meta_query' => array(mah_jobs_lite_active_clause()),
    );
    if ($country) {
        $args['tax_query'] = array(array(
            'taxonomy' => 'ma_job_country',
            'field' => 'term_id',
            'terms' => array($country),
            'include_children' => false,
        ));
    }

    if ($city) { $args['meta_query'][] = array('key' => '_ma_job_city', 'value' => $city, 'compare' => '='); }
    if ($job_title) { $args['meta_query'][] = array('key' => '_ma_job_role', 'value' => $job_title, 'compare' => '='); }
    if ($year) { $args['meta_query'][] = array('key' => '_ma_job_posted_on', 'value' => '^' . $year . '-', 'compare' => 'REGEXP'); }
    if ($month) { $args['meta_query'][] = array('key' => '_ma_job_posted_on', 'value' => '^[0-9]{4}-' . sprintf('%02d', $month) . '-', 'compare' => 'REGEXP'); }
    if ($country_input !== '' && !$country) { $args['post__in'] = array(0); }
    $jobs = new WP_Query($args);
    ob_start();
    ?>
    <div class="mah-jobs-lite" dir="rtl">
        <style>
        .mah-jobs-lite{font-family:inherit;color:#213a41}
        .mah-jobs-lite__filters{display:flex;align-items:end;gap:12px;flex-wrap:wrap;margin:0 0 24px}
        .mah-jobs-lite__filters label{font-weight:600}
        .mah-jobs-lite__filters select,.mah-jobs-lite__filters input{min-width:120px;max-width:210px;padding:10px;background:#fff;border:1px solid #cfdadc;border-radius:8px}
        .mah-jobs-lite__filters button{background:#116874;color:#fff;border:0;border-radius:8px;padding:10px 22px;cursor:pointer}
        .mah-jobs-lite__grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,290px),1fr));gap:16px}
        .mah-jobs-lite__item{padding:22px;border:1px solid #e0e7e8;border-radius:13px;background:#fff}
        .mah-jobs-lite__item h3{font-size:1.1rem;line-height:1.7;margin:0 0 12px}
        .mah-jobs-lite__item a{text-decoration:none;color:#116874}
        .mah-jobs-lite__item a:hover{text-decoration:underline}
        .mah-jobs-lite__item p{margin:8px 0;color:#5a6d73;line-height:1.7}
        .mah-jobs-lite__paging{display:flex;gap:10px;flex-wrap:wrap;margin:28px 0}
        .mah-jobs-lite__paging a{padding:6px 13px;border:1px solid #cfdadc;border-radius:7px;color:#116874}
        </style>
        <nav aria-label="<?php echo esc_attr('الوظائف حسب الدولة'); ?>">
            <?php foreach ($terms as $term) : ?>
                <a href="<?php echo esc_url(add_query_arg('mh_country', $term->slug, remove_query_arg(array('mh_country', 'mhj_country', 'mh_page', 'mhj_page')))); ?>"><?php echo esc_html('وظائف ' . $term->name); ?></a>
            <?php endforeach; ?>
        </nav>
        <form class="mah-jobs-lite__filters" method="get">
            <label for="mhj-country"><?php echo esc_html('تصفية الوظائف حسب الدولة'); ?></label>
            <select id="mhj-country" name="mh_country">
                <option value=""><?php echo esc_html('جميع الدول'); ?></option>
                <?php foreach ($terms as $term) : ?>
                    <option value="<?php echo esc_attr($term->slug); ?>" <?php selected($country, (int) $term->term_id); ?>>
                        <?php echo esc_html($term->name); ?>
                    </option>
                <?php endforeach; ?>
            </select>
            <label for="mhj-city"><?php echo esc_html('المدينة'); ?></label>
            <input id="mhj-city" name="mh_city" type="search" maxlength="100" value="<?php echo esc_attr($city); ?>" />
            <label for="mhj-job"><?php echo esc_html('الوظيفة'); ?></label>
            <input id="mhj-job" name="mh_role" type="search" maxlength="100" value="<?php echo esc_attr($job_title); ?>" />
            <label for="mhj-month"><?php echo esc_html('شهر الإعلان'); ?></label>
            <select id="mhj-month" name="mh_month">
                <option value="0"><?php echo esc_html('جميع الشهور'); ?></option>
                <?php for ($i = 1; $i <= 12; $i++) : ?>
                  <option value="<?php echo esc_attr((string) $i); ?>" <?php selected($month, $i); ?>><?php echo esc_html((string) $i); ?></option>
                <?php endfor; ?>
            </select>
            <label for="mhj-year"><?php echo esc_html('سنة الإعلان'); ?></label>
            <select id="mhj-year" name="mh_year">
                <option value="0"><?php echo esc_html('جميع السنوات'); ?></option>
                <?php for ($i = (int) gmdate('Y'); $i >= 2015; $i--) : ?>
                  <option value="<?php echo esc_attr((string) $i); ?>" <?php selected($year, $i); ?>><?php echo esc_html((string) $i); ?></option>
                <?php endfor; ?>
            </select>
            <button type="submit"><?php echo esc_html('عرض النتائج'); ?></button>
        </form>
        <div class="mah-jobs-lite__grid">
        <?php if ($jobs->have_posts()) : ?>
            <?php while ($jobs->have_posts()) : $jobs->the_post(); ?>
                <article class="mah-jobs-lite__item">
                    <h3><a href="<?php echo esc_url(get_permalink()); ?>"><?php echo esc_html(get_the_title()); ?></a></h3>
                    <p><?php echo esc_html(wp_trim_words(wp_strip_all_tags(get_the_excerpt() ?: get_the_content()), 28)); ?></p>
                    <a href="<?php echo esc_url(get_permalink()); ?>"><?php echo esc_html('تفاصيل الوظيفة والتقديم'); ?></a>
                </article>
            <?php endwhile; ?>
        <?php else : ?>
            <p><?php echo esc_html('لا توجد وظائف مطابقة حاليًا.'); ?></p>
        <?php endif; ?>
        </div>
        <?php
        if ($jobs->max_num_pages > 1) {
            $base = remove_query_arg(array('mh_page', 'mhj_page'));
            echo '<nav class="mah-jobs-lite__paging" aria-label="صفحات الوظائف">';
            if ($page > 1) {
                echo '<a href="' . esc_url(add_query_arg('mh_page', $page - 1, $base)) . '">السابق</a>';
            }
            if ($page < $jobs->max_num_pages) {
                echo '<a href="' . esc_url(add_query_arg('mh_page', $page + 1, $base)) . '">التالي</a>';
            }
            echo '</nav>';
        }
        wp_reset_postdata();
        ?>
    </div>
    <?php
    return ob_get_clean();
}

/** Rewrite on activation only; no recurring cron jobs or external network calls. */
register_activation_hook(__FILE__, function () {
    // Registration during the same request is delegated to init on the next load.
    update_option('mah_jobs_lite_rewrite_flush_pending', '1', false);
});
add_action('init', function () {
    if (get_option('mah_jobs_lite_rewrite_flush_pending') !== '1') {
        return;
    }
    delete_option('mah_jobs_lite_rewrite_flush_pending');
    flush_rewrite_rules(false);
}, 1000);
register_deactivation_hook(__FILE__, function () {
    // Never delete job posts, terms, or credentials of the legacy plugin.
    flush_rewrite_rules(false);
});
